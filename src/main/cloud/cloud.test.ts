// Cloud clients against local mock servers that replay the documented protocols.
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import type { TranscriptEvent } from '@shared/types'
import { GeminiLive } from './geminiLive'
import { Pcm16Resampler, type CloudStatus } from './liveSocket'
import { OpenAiRealtime } from './openaiRealtime'

const servers: WebSocketServer[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

function server(onConn: (ws: WebSocket, url: string, headers: Record<string, unknown>) => void, verify?: (url: string, h: Record<string, unknown>) => boolean) {
  const wss = new WebSocketServer({
    port: 0,
    verifyClient: verify ? (info: { req: { url?: string; headers: Record<string, unknown> } }) => verify(info.req.url ?? '', info.req.headers) : undefined
  })
  servers.push(wss)
  wss.on('connection', (ws, req) => onConn(ws, req.url ?? '', req.headers))
  return `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`
}

function recorder() {
  const transcripts: TranscriptEvent[] = []
  const statuses: { state: CloudStatus; detail?: string }[] = []
  return {
    transcripts,
    statuses,
    cb: { transcript: (e: TranscriptEvent) => transcripts.push(e), status: (state: CloudStatus, detail?: string) => statuses.push({ state, detail }) }
  }
}

async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const pcm = (ms: number) => Buffer.alloc(32 * ms) // 16 kHz PCM16 = 32 bytes per ms

describe('Pcm16Resampler', () => {
  it('upsamples 16 kHz to 24 kHz continuously across chunks', () => {
    const r = new Pcm16Resampler(16000, 24000)
    const ramp = Int16Array.from({ length: 1600 }, (_, i) => i * 10)
    const a = r.process(Buffer.from(ramp.slice(0, 800).buffer))
    const b = r.process(Buffer.from(ramp.slice(800).buffer))
    const out = new Int16Array(Buffer.concat([a, b]).buffer.slice(0))
    expect(Math.abs(out.length - 2400)).toBeLessThanOrEqual(2)
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1])
  })
})

describe('OpenAI Realtime (transcription session)', () => {
  it('configures the session, buffers audio until ready, and maps deltas/completions', async () => {
    const received: Record<string, unknown>[] = []
    let appendedBytes = 0
    const url = server((ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        received.push(msg)
        if (msg.type === 'session.update') setTimeout(() => ws.send(JSON.stringify({ type: 'session.updated', session: msg.session })), 30)
        if (msg.type === 'input_audio_buffer.append') appendedBytes += Buffer.from(msg.audio, 'base64').length
        if (msg.type === 'input_audio_buffer.commit') {
          ws.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'item_1' }))
          ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item_1', delta: 'Wir schauen,' }))
          ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item_1', delta: ' ob Agenten' }))
          ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item_1', transcript: 'Wir schauen, ob Agenten versuchen.' }))
        }
      })
    }, (_u, h) => h.authorization === 'Bearer sk-test')
    const rec = recorder()
    const c = new OpenAiRealtime({ apiKey: 'sk-test', model: 'gpt-live-transcribe', language: 'de', vocabulary: ['KI-Agenten', 'Shut<down>'], url }, rec.cb)
    c.start()
    c.audio(pcm(200)) // before ready → buffered
    c.commit()
    await until(() => rec.transcripts.some((t) => t.kind === 'final'))

    const update = received[0] as { type: string; session: { type: string; audio: { input: Record<string, any> } } }
    expect(update.type).toBe('session.update')
    expect(update.session.type).toBe('transcription')
    expect(update.session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 })
    expect(update.session.audio.input.turn_detection).toBeNull()
    expect(update.session.audio.input.transcription).toMatchObject({ model: 'gpt-live-transcribe', languages: ['de'], keywords: ['KI-Agenten', 'Shutdown'] })
    expect(Math.abs(appendedBytes - 200 * 48)).toBeLessThan(8) // resampled to 24 kHz
    expect(rec.transcripts).toEqual([
      { utteranceId: 'item_1', kind: 'partial', text: 'Wir schauen,' },
      { utteranceId: 'item_1', kind: 'partial', text: 'Wir schauen, ob Agenten' },
      { utteranceId: 'item_1', kind: 'final', text: 'Wir schauen, ob Agenten versuchen.' }
    ])
    expect(rec.statuses.map((s) => s.state)).toEqual(['connecting', 'ready'])
    await c.stop()
  })

  it('does not commit an empty turn', async () => {
    const types: string[] = []
    const url = server((ws) =>
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        types.push(msg.type)
        if (msg.type === 'session.update') ws.send(JSON.stringify({ type: 'session.updated' }))
      })
    )
    const rec = recorder()
    const c = new OpenAiRealtime({ apiKey: 'k', model: 'gpt-live-transcribe', language: 'de', vocabulary: [], url }, rec.cb)
    c.start()
    await until(() => rec.statuses.some((s) => s.state === 'ready'))
    c.commit()
    c.audio(pcm(40))
    c.commit()
    await new Promise((r) => setTimeout(r, 100))
    expect(types.filter((t) => t === 'input_audio_buffer.commit')).toHaveLength(0)
    await c.stop()
  })

  it('fails fast on a rejected API key (no retry storm)', async () => {
    const url = server(() => undefined, () => false) // verifyClient rejects → HTTP 401
    const rec = recorder()
    const c = new OpenAiRealtime({ apiKey: 'bad', model: 'gpt-live-transcribe', language: 'de', vocabulary: [], url }, rec.cb)
    c.start()
    await until(() => rec.statuses.some((s) => s.state === 'failed'))
    expect(rec.statuses.at(-1)).toEqual({ state: 'failed', detail: 'auth' })
    expect(rec.statuses.filter((s) => s.state === 'reconnecting')).toHaveLength(0)
  })

  it('reconnects after a dropped connection and hands over open partials as finals', async () => {
    let connections = 0
    const url = server((ws) => {
      connections++
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'session.update') {
          ws.send(JSON.stringify({ type: 'session.updated' }))
          if (connections === 1) {
            ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i1', delta: 'Guten Morgen' }))
            setTimeout(() => ws.terminate(), 30)
          }
        }
      })
    })
    const rec = recorder()
    const c = new OpenAiRealtime({ apiKey: 'k', model: 'gpt-live-transcribe', language: 'de', vocabulary: [], url }, rec.cb)
    c.start()
    await until(() => rec.statuses.filter((s) => s.state === 'ready').length === 2)
    expect(rec.statuses.map((s) => s.state)).toContain('reconnecting')
    expect(rec.transcripts).toContainEqual({ utteranceId: 'i1', kind: 'final', text: 'Guten Morgen' })
    await c.stop()
  })
})

describe('Gemini Live (transcribe-live)', () => {
  it('sends the setup, streams audio, maps interim/final transcriptions', async () => {
    const received: Record<string, any>[] = []
    let keyInUrl = ''
    const url = server((ws, reqUrl) => {
      keyInUrl = new URL(reqUrl, 'http://x').searchParams.get('key') ?? ''
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        received.push(msg)
        if (msg.setup) ws.send(JSON.stringify({ setupComplete: {} }))
        if (msg.realtimeInput?.audioStreamEnd) {
          ws.send(JSON.stringify({ serverContent: { interimInputTranscription: { text: 'Wir schauen' } } }))
          ws.send(JSON.stringify({ serverContent: { interimInputTranscription: { text: 'Wir schauen, ob Agenten' } } }))
          ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Wir schauen, ob Agenten versuchen.' } } }))
        }
      })
    })
    const rec = recorder()
    const c = new GeminiLive({ apiKey: 'g-key', model: 'gemini-3.5-transcribe-live', language: 'de', vocabulary: ['KI-Agenten'], url }, rec.cb)
    c.start()
    c.audio(pcm(100))
    c.commit()
    await until(() => rec.transcripts.some((t) => t.kind === 'final'))
    expect(keyInUrl).toBe('g-key')
    expect(received[0].setup).toMatchObject({
      model: 'models/gemini-3.5-transcribe-live',
      generationConfig: { responseModalities: ['TEXT'] },
      inputAudioTranscription: { languageCodes: ['de-DE'], mode: 'SMART', customVocabulary: ['KI-Agenten'] }
    })
    expect(received[1].realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000')
    expect(Buffer.from(received[1].realtimeInput.audio.data, 'base64').length).toBe(3200)
    const ids = new Set(rec.transcripts.map((t) => t.utteranceId))
    expect(ids.size).toBe(1)
    expect(rec.transcripts.map((t) => [t.kind, t.text])).toEqual([
      ['partial', 'Wir schauen'],
      ['partial', 'Wir schauen, ob Agenten'],
      ['final', 'Wir schauen, ob Agenten versuchen.']
    ])
    await c.stop()
  })

  it('rotates the connection on goAway without losing audio', async () => {
    let connections = 0
    let audioOnSecond = 0
    const url = server((ws) => {
      const n = ++connections
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.setup) {
          ws.send(JSON.stringify({ setupComplete: {} }))
          if (n === 1) ws.send(JSON.stringify({ goAway: { timeLeft: '5s' } }))
        }
        if (msg.realtimeInput?.audio && n === 2) audioOnSecond++
      })
    })
    const rec = recorder()
    const c = new GeminiLive({ apiKey: 'k', model: 'gemini-3.5-transcribe-live', language: 'de', vocabulary: [], url }, rec.cb)
    c.start()
    await until(() => connections === 2)
    c.audio(pcm(100))
    await until(() => audioOnSecond === 1)
    expect(rec.statuses.some((s) => s.detail === 'go-away')).toBe(true)
    await c.stop()
  })

  it('falls back to a minimal setup if the server rejects the optional fields', async () => {
    const setups: Record<string, any>[] = []
    const url = server((ws) =>
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (!msg.setup) return
        setups.push(msg.setup)
        if (msg.setup.inputAudioTranscription.customVocabulary) ws.close(1007, 'Invalid JSON payload received. Unknown name "customVocabulary"')
        else ws.send(JSON.stringify({ setupComplete: {} }))
      })
    )
    const rec = recorder()
    const c = new GeminiLive({ apiKey: 'k', model: 'gemini-3.5-transcribe-live', language: 'de', vocabulary: ['X'], url }, rec.cb)
    c.start()
    await until(() => rec.statuses.some((s) => s.state === 'ready'), 5000)
    expect(setups).toHaveLength(2)
    expect(setups[1].inputAudioTranscription).toEqual({ languageCodes: ['de-DE'] })
    await c.stop()
  })
})
