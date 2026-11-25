import type { LocalModelId, SpeechLanguage } from '@shared/types'

export interface WhisperSpec {
  id: string
  dtype: Record<string, string>
}

/**
 * Measured on an RTX 5090 Laptop (WebGPU): turbo q4/q4 ≈ 760 MB, 0.6–1.4 s per pass, near-perfect
 * German; the fp32 encoder (2.5 GB single file) exceeds the browser cache's ArrayBuffer limit.
 */
export const WHISPER: Record<LocalModelId, WhisperSpec> = {
  'whisper-large-v3-turbo': {
    id: 'onnx-community/whisper-large-v3-turbo',
    dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' }
  },
  'whisper-small': {
    id: 'onnx-community/whisper-small',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }
  }
}

/** CPU fallback when WebGPU is unavailable: only the small model is fast enough. */
export const WHISPER_CPU: WhisperSpec = {
  id: 'onnx-community/whisper-small',
  dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }
}

export const VAD_MODEL = 'onnx-community/silero-vad'
export const EMBED_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

export const WHISPER_LANGUAGE: Record<SpeechLanguage, string> = { de: 'german', en: 'english' }
