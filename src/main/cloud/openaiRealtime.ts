// OpenAI Realtime API, transcription-only session (developers.openai.com, Nov 2026).
// `gpt-live-transcribe` has no server VAD: our shared VAD ends each turn with a commit.
import type { SpeechLanguage } from '@shared/types'
import { LiveSocket, Pcm16Resampler, type LiveCallbacks } from './liveSocket'

export interface OpenAiOptions {
  apiKey: string
  model: string
  language: SpeechLanguage
  vocabulary: string[]
  /** Override for tests (mock server). */
  url?: string
}

/** Keywords must be single-line and free of angle brackets. */
function cleanKeywords(words: string[]): string[] {
  return [...new Set(words.map((w) => w.replace(/[<>\r\n]/g, '').trim()).filter(Boolean))].slice(0, 100)
}

export class OpenAiRealtime extends LiveSocket {
  private resampler = new Pcm16Resampler(16000, 24000)
  /** item_id → text so far (deltas may arrive before `committed` names the item). */
  private partials = new Map<string, string>()
  private bytesSinceCommit = 0

  constructor(
    private readonly opts: OpenAiOptions,
    cb: LiveCallbacks
  ) {
    super(cb)
  }

  protected url(): string {
    return this.opts.url ?? 'wss://api.openai.com/v1/realtime?intent=transcription'
  }

  protected headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.opts.apiKey}` }
  }

  protected setup(): unknown[] {
    const live = this.opts.model.startsWith('gpt-live')
    const transcription: Record<string, unknown> = { model: this.opts.model }
    if (live) {
      transcription.languages = [this.opts.language]
      transcription.keywords = cleanKeywords(this.opts.vocabulary)
    } else {
      transcription.language = this.opts.language
      if (!this.opts.model.includes('whisper')) transcription.prompt = this.opts.vocabulary.slice(0, 60).join(', ')
    }
    return [
      {
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription, turn_detection: null } }
        }
      }
    ]
  }

  protected onMessage(msg: Record<string, unknown>): boolean {
    switch (msg.type) {
      case 'session.updated':
        return true
      case 'conversation.item.input_audio_transcription.delta': {
        const id = String(msg.item_id)
        const text = (this.partials.get(id) ?? '') + String(msg.delta ?? '')
        this.partials.set(id, text)
        this.cb.transcript({ utteranceId: id, kind: 'partial', text })
        return false
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const id = String(msg.item_id)
        this.partials.delete(id)
        this.cb.transcript({ utteranceId: id, kind: 'final', text: String(msg.transcript ?? '') })
        return false
      }
      case 'conversation.item.input_audio_transcription.failed': {
        const id = String(msg.item_id)
        const text = this.partials.get(id) ?? ''
        this.partials.delete(id)
        if (text) this.cb.transcript({ utteranceId: id, kind: 'final', text })
        return false
      }
      case 'error': {
        const err = (msg.error ?? {}) as { code?: string; type?: string; message?: string }
        if (err.code === 'invalid_api_key' || err.type === 'authentication_error') this.fail('auth')
        else if (err.code === 'session_expired') this.rotate('expired')
        return false
      }
      default:
        return false
    }
  }

  protected sendAudio(pcm16k: Buffer): void {
    const pcm = this.resampler.process(pcm16k)
    this.bytesSinceCommit += pcm.length
    this.send({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') })
  }

  protected sendCommit(): void {
    // Committing an (almost) empty buffer is an error; < 100 ms of audio is not a turn.
    if (this.bytesSinceCommit < 4800) return
    this.bytesSinceCommit = 0
    this.send({ type: 'input_audio_buffer.commit' })
  }

  protected onReset(): void {
    // A dropped connection loses its open items: hand over what we have as finals.
    for (const [id, text] of this.partials) if (text) this.cb.transcript({ utteranceId: id, kind: 'final', text })
    this.partials.clear()
    this.bytesSinceCommit = 0
    this.resampler = new Pcm16Resampler(16000, 24000)
  }
}
