// Gemini Live API with the dedicated `gemini-3.5-transcribe-live` model (aistudio.google.com, Nov 2026):
// TEXT only, never replies. Sessions are capped (~10 min) → rotate proactively and on `goAway`.
import type { SpeechLanguage } from '@shared/types'
import { LiveSocket, type LiveCallbacks } from './liveSocket'

export interface GeminiOptions {
  apiKey: string
  model: string
  language: SpeechLanguage
  vocabulary: string[]
  url?: string
  /** Rotate the connection before the server's session limit (ms). */
  rotateAfterMs?: number
}

const LANGUAGE_CODES: Record<SpeechLanguage, string> = { de: 'de-DE', en: 'en-US' }
const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

export class GeminiLive extends LiveSocket {
  private segment = 0
  private readonly tag = Math.random().toString(36).slice(2, 7)
  private interim = ''
  private rotateTimer: NodeJS.Timeout | undefined
  /** Fields not yet verified against the live service; dropped if the server rejects setup. */
  private minimalSetup = false
  private gotSetupComplete = false

  constructor(
    private readonly opts: GeminiOptions,
    cb: LiveCallbacks
  ) {
    super(cb)
  }

  protected url(): string {
    return `${this.opts.url ?? ENDPOINT}?key=${encodeURIComponent(this.opts.apiKey)}`
  }

  protected headers(): Record<string, string> {
    return {}
  }

  protected setup(): unknown[] {
    this.gotSetupComplete = false
    const inputAudioTranscription: Record<string, unknown> = { languageCodes: [LANGUAGE_CODES[this.opts.language]] }
    if (!this.minimalSetup) {
      // SMART drops fillers and applies self-corrections — exactly what script tracking wants.
      inputAudioTranscription.mode = 'SMART'
      inputAudioTranscription.customVocabulary = this.opts.vocabulary.slice(0, 100)
    }
    return [
      {
        setup: {
          model: this.opts.model.startsWith('models/') ? this.opts.model : `models/${this.opts.model}`,
          generationConfig: { responseModalities: ['TEXT'] },
          inputAudioTranscription
        }
      }
    ]
  }

  protected onMessage(msg: Record<string, unknown>): boolean {
    if ('setupComplete' in msg) {
      this.gotSetupComplete = true
      clearTimeout(this.rotateTimer)
      this.rotateTimer = setTimeout(() => this.rotate('session-limit'), this.opts.rotateAfterMs ?? 9 * 60_000)
      return true
    }
    if ('goAway' in msg) {
      this.rotate('go-away')
      return false
    }
    const content = msg.serverContent as
      | { interimInputTranscription?: { text?: string }; inputTranscription?: { text?: string } }
      | undefined
    if (content?.interimInputTranscription?.text !== undefined) {
      this.interim = content.interimInputTranscription.text
      this.cb.transcript({ utteranceId: this.utteranceId(), kind: 'partial', text: this.interim })
    }
    if (content?.inputTranscription?.text !== undefined) {
      this.cb.transcript({ utteranceId: this.utteranceId(), kind: 'final', text: content.inputTranscription.text })
      this.interim = ''
      this.segment++
    }
    return false
  }

  private utteranceId(): string {
    return `g${this.tag}-${this.segment}`
  }

  protected sendAudio(pcm16k: Buffer): void {
    this.send({ realtimeInput: { audio: { data: pcm16k.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } })
  }

  protected sendCommit(): void {
    this.send({ realtimeInput: { audioStreamEnd: true } })
  }

  protected onReset(): void {
    clearTimeout(this.rotateTimer)
    // Setup rejected before completing (unverified optional fields) → retry with the minimal setup.
    if (!this.gotSetupComplete && !this.minimalSetup) this.minimalSetup = true
    if (this.interim) this.cb.transcript({ utteranceId: this.utteranceId(), kind: 'final', text: this.interim })
    this.interim = ''
    this.segment++
  }
}
