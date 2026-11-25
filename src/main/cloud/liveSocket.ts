import WebSocket from 'ws'
import type { CloudEvent, TranscriptEvent } from '@shared/types'

export type CloudStatus = Extract<CloudEvent, { type: 'status' }>['state']

export interface LiveCallbacks {
  transcript(e: TranscriptEvent): void
  status(state: CloudStatus, detail?: string): void
}

type Queued = { kind: 'audio'; pcm: Buffer } | { kind: 'commit' }

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]
const MAX_FAILURES = BACKOFF_MS.length
/** Audio kept while (re)connecting: ~20 s of 16 kHz PCM16. */
const MAX_BUFFER_BYTES = 20 * 32000
const WATCHDOG_MS = 15000

/**
 * A live transcription WebSocket that survives the real world: connects, sends its setup, waits
 * until the server is ready, buffers audio during (re)connects, reconnects with backoff and
 * gives up with `failed` only after repeated failures. Transcripts are never touched — the
 * tracker state lives in the renderer and is unaffected by any of this (SYS-11).
 */
export abstract class LiveSocket {
  private ws: WebSocket | null = null
  private ready = false
  private stopped = false
  private failures = 0
  private queue: Queued[] = []
  private queuedBytes = 0
  private retryTimer: NodeJS.Timeout | undefined
  private watchdog: NodeJS.Timeout | undefined
  private lastServerMessage = 0
  private lastAudioSent = 0

  constructor(protected readonly cb: LiveCallbacks) {}

  protected abstract url(): string
  protected abstract headers(): Record<string, string>
  /** First messages after the socket opens. */
  protected abstract setup(): unknown[]
  /** Handle one server message; return true once the session is ready for audio. */
  protected abstract onMessage(msg: Record<string, unknown>): boolean | void
  protected abstract sendAudio(pcm16k: Buffer): void
  protected abstract sendCommit(): void
  /** Called when a connection is replaced (e.g. emit pending partials as finals). */
  protected onReset(): void {}

  start(): void {
    this.stopped = false
    this.cb.status('connecting')
    this.connect()
  }

  audio(pcm16k: Buffer): void {
    if (this.ready) {
      this.sendAudio(pcm16k)
      this.lastAudioSent = Date.now()
      return
    }
    this.queue.push({ kind: 'audio', pcm: pcm16k })
    this.queuedBytes += pcm16k.length
    while (this.queuedBytes > MAX_BUFFER_BYTES) {
      const dropped = this.queue.shift()
      if (dropped?.kind === 'audio') this.queuedBytes -= dropped.pcm.length
    }
  }

  commit(): void {
    if (this.ready) this.sendCommit()
    else if (this.queue.length) this.queue.push({ kind: 'commit' })
  }

  async stop(): Promise<void> {
    this.stopped = true
    clearTimeout(this.retryTimer)
    clearInterval(this.watchdog)
    this.onReset()
    const ws = this.ws
    this.ws = null
    this.ready = false
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000)
    } else ws?.terminate()
    this.cb.status('closed')
  }

  /** Replace the connection (server asked us to go away, session time limit, stalled stream). */
  protected rotate(reason: string): void {
    if (this.stopped) return
    this.dropSocket()
    this.cb.status('reconnecting', reason)
    this.connect()
  }

  protected send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  protected fail(detail: string): void {
    this.stopped = true
    clearTimeout(this.retryTimer)
    clearInterval(this.watchdog)
    this.dropSocket()
    this.cb.status('failed', detail)
  }

  private dropSocket(): void {
    this.onReset()
    const ws = this.ws
    this.ws = null
    this.ready = false
    ws?.removeAllListeners()
    ws?.on('error', () => undefined)
    ws?.terminate()
  }

  private connect(): void {
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url(), { headers: this.headers(), handshakeTimeout: 10000 })
    } catch (err) {
      return this.scheduleRetry(String(err))
    }
    this.ws = ws
    ws.on('open', () => {
      this.lastServerMessage = Date.now()
      for (const m of this.setup()) this.send(m)
    })
    ws.on('message', (data) => {
      if (ws !== this.ws) return
      this.lastServerMessage = Date.now()
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (this.onMessage(msg) && !this.ready) this.becomeReady()
    })
    ws.on('unexpected-response', (_req, res) => {
      const code = res.statusCode ?? 0
      if (code === 401 || code === 403) this.fail('auth')
      else this.scheduleRetry(`http-${code}`)
    })
    ws.on('close', (code, reason) => {
      if (ws !== this.ws) return
      const text = reason.toString()
      if (code === 1008 || /api key|unauthori[sz]ed|permission/i.test(text)) return this.fail('auth')
      this.scheduleRetry(text || `close-${code}`)
    })
    ws.on('error', (err) => {
      if (ws === this.ws && ws.readyState !== WebSocket.OPEN) this.scheduleRetry(err.message)
    })
  }

  private becomeReady(): void {
    this.ready = true
    this.failures = 0
    this.cb.status('ready')
    for (const q of this.queue) {
      if (q.kind === 'audio') this.sendAudio(q.pcm)
      else this.sendCommit()
    }
    this.queue = []
    this.queuedBytes = 0
    clearInterval(this.watchdog)
    // Stalled stream: audio keeps flowing but the server went silent.
    this.watchdog = setInterval(() => {
      const now = Date.now()
      if (now - this.lastAudioSent < 2000 && now - this.lastServerMessage > WATCHDOG_MS) this.rotate('stalled')
    }, 2000)
  }

  private scheduleRetry(detail: string): void {
    if (this.stopped) return
    this.dropSocket()
    if (++this.failures > MAX_FAILURES) return this.fail(detail)
    this.cb.status('reconnecting', detail)
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.connect(), BACKOFF_MS[this.failures - 1])
  }
}

/** Stateful linear-interpolation resampler for PCM16 mono (e.g. 16 kHz → 24 kHz). */
export class Pcm16Resampler {
  private pos = 0
  private last = 0

  constructor(
    private readonly from: number,
    private readonly to: number
  ) {}

  process(input: Buffer): Buffer {
    const src = new Int16Array(input.buffer, input.byteOffset, Math.floor(input.length / 2))
    const step = this.from / this.to
    const out: number[] = []
    // Sample index -1 is the last sample of the previous chunk.
    const at = (i: number) => (i < 0 ? this.last : src[i])
    while (this.pos < src.length - 1 + 1e-9) {
      const i = Math.floor(this.pos)
      const frac = this.pos - i
      const a = at(i)
      const b = i + 1 < src.length ? src[i + 1] : a
      out.push(Math.round(a + (b - a) * frac))
      this.pos += step
    }
    this.pos -= src.length
    if (src.length) this.last = src[src.length - 1]
    return Buffer.from(Int16Array.from(out).buffer)
  }
}
