import type { CloudEvent, LocalModelId, ProviderId, SpeechLanguage, SpeechStatus, TranscriptEvent } from '@shared/types'
import { AudioCapture } from './audioCapture'
import type { MicProblem } from './micDevices'
import type { WorkerIn, WorkerOut } from './speech.worker'

export interface EngineOptions {
  provider: ProviderId
  localModel: LocalModelId
  language: SpeechLanguage
  microphoneId: string | null
  vocabulary: string[]
  cloudModel: string
  fallbackToLocal: boolean
}

export interface EngineCallbacks {
  /** `appendOnly`: earlier text of the utterance never changes (no LocalAgreement needed). */
  onTranscript(e: TranscriptEvent, appendOnly: boolean): void
  onStatus(s: SpeechStatus): void
}

/**
 * One speech pipeline for every provider: microphone → worklet → speech worker (VAD, and Whisper
 * when local). Cloud providers receive only speech audio through the main process.
 */
export class SpeechEngine {
  private worker: Worker | null = null
  private capture: AudioCapture | null = null
  private unsubscribeCloud: (() => void) | null = null
  private provider: ProviderId
  private paused = false
  private stopped = false
  private micProblem: MicProblem | null = null
  private hearing = false
  private fellBack = false

  constructor(
    private readonly opts: EngineOptions,
    private readonly cb: EngineCallbacks
  ) {
    this.provider = opts.provider
  }

  async start(): Promise<void> {
    this.stopped = false
    this.cb.onStatus({ state: 'loading', progress: 0 })
    if (this.provider !== 'local') await this.startCloud()
    await this.startPipeline(this.provider === 'local' ? 'local' : 'vad')
  }

  private startPipeline(mode: 'local' | 'vad'): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      const channel = new MessageChannel()
      worker.onmessage = async (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        switch (m.type) {
          case 'progress':
            this.cb.onStatus({ state: 'loading', progress: m.progress })
            break
          case 'ready':
            try {
              this.capture = new AudioCapture(this.opts.microphoneId, (problem) => {
                this.micProblem = problem
                this.emitStatus()
              })
              await this.capture.start(channel.port1)
              this.emitStatus()
              resolve()
            } catch (err) {
              reject(err)
            }
            break
          case 'error':
            this.cb.onStatus({ state: 'error', detail: m.message })
            reject(new Error(m.message))
            break
          case 'vad':
            this.hearing = m.speaking
            this.emitStatus()
            break
          case 'transcript':
            this.cb.onTranscript({ utteranceId: m.utteranceId, kind: m.kind, text: m.text }, false)
            break
          case 'pcm':
            window.presentflow.cloud.audio(m.data)
            break
          case 'turnEnd':
            window.presentflow.cloud.commit()
            break
        }
      }
      const init: WorkerIn = {
        type: 'init',
        mode,
        model: this.opts.localModel,
        language: this.opts.language,
        port: channel.port2
      }
      worker.postMessage(init, [channel.port2])
    })
  }

  private async startCloud(): Promise<void> {
    if (this.provider === 'local') return
    this.unsubscribeCloud = window.presentflow.cloud.onEvent((e: CloudEvent) => {
      if (e.type === 'transcript') {
        this.cb.onTranscript(e.event, this.provider === 'openai')
        return
      }
      if (e.state === 'reconnecting' || e.state === 'connecting') this.cb.onStatus({ state: 'reconnecting' })
      else if (e.state === 'ready') this.emitStatus()
      else if (e.state === 'failed') void this.onCloudFailed(e.detail)
    })
    await window.presentflow.cloud.start({
      provider: this.provider,
      model: this.opts.cloudModel,
      language: this.opts.language,
      vocabulary: this.opts.vocabulary
    })
  }

  private async onCloudFailed(detail?: string): Promise<void> {
    if (this.stopped) return
    if (!this.opts.fallbackToLocal || this.fellBack) {
      this.cb.onStatus({ state: 'error', detail: detail ?? 'cloud' })
      return
    }
    // Privacy-safe fallback: audio stays on this computer from now on.
    this.fellBack = true
    await this.teardown()
    this.provider = 'local'
    this.stopped = false
    try {
      await this.startPipeline('local')
      this.cb.onStatus({ state: 'listening', detail: 'fallback' })
    } catch (err) {
      this.cb.onStatus({ state: 'error', detail: String(err) })
    }
  }

  private emitStatus(): void {
    if (this.stopped) return
    if (this.micProblem) this.cb.onStatus({ state: 'error', detail: `mic-${this.micProblem}` })
    else if (this.paused) this.cb.onStatus({ state: 'paused' })
    else this.cb.onStatus({ state: 'listening', hearing: this.hearing, detail: this.fellBack ? 'fallback' : undefined })
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused
    this.worker?.postMessage({ type: paused ? 'pause' : 'resume' } satisfies WorkerIn)
    await this.capture?.setPaused(paused)
    if (paused) this.hearing = false
    this.emitStatus()
  }

  private async teardown(): Promise<void> {
    this.stopped = true
    this.unsubscribeCloud?.()
    this.unsubscribeCloud = null
    await this.capture?.stop()
    this.capture = null
    this.worker?.terminate()
    this.worker = null
    if (this.opts.provider !== 'local') await window.presentflow.cloud.stop().catch(() => undefined)
  }

  async stop(): Promise<void> {
    await this.teardown()
    this.cb.onStatus({ state: 'idle' })
  }
}

/** Download / cache check of local models without starting a rehearsal (Settings). */
export function modelWorker(): Worker {
  return new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' })
}
