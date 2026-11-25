// Sentence embeddings on CPU/WASM (~8 ms per sentence) — keeps the GPU free for Whisper.
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { EMBED_MODEL } from './models'

export type EmbedIn = { id: number; texts: string[] }
export type EmbedOut = { id: number; vectors?: Float32Array[]; error?: string }

let extractor: Promise<FeatureExtractionPipeline> | null = null

self.onmessage = async (e: MessageEvent<EmbedIn>) => {
  const { id, texts } = e.data
  try {
    extractor ??= pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8', device: 'wasm' }) as Promise<FeatureExtractionPipeline>
    const ex = await extractor
    const vectors: Float32Array[] = []
    for (const t of texts) vectors.push(new Float32Array((await ex(t, { pooling: 'mean', normalize: true })).data as Float32Array))
    ;(self as unknown as Worker).postMessage({ id, vectors } satisfies EmbedOut, vectors.map((v) => v.buffer))
  } catch (err) {
    extractor = null
    ;(self as unknown as Worker).postMessage({ id, error: String(err) } satisfies EmbedOut)
  }
}
