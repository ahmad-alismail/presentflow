// Real multilingual sentence embeddings in Node (CPU) — same model the app runs in its embed worker.
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type { Embedder } from './helpers'

export const EMBED_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

let extractor: Promise<FeatureExtractionPipeline> | null = null

export function nodeEmbedder(): Embedder {
  extractor ??= pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8', device: 'cpu' }) as Promise<FeatureExtractionPipeline>
  const cache = new Map<string, Float32Array>()
  return {
    async embed(text: string) {
      const hit = cache.get(text)
      if (hit) return hit
      const out = await (await extractor!)(text, { pooling: 'mean', normalize: true })
      const vec = new Float32Array(out.data as Float32Array)
      cache.set(text, vec)
      return vec
    }
  }
}

export async function embedAll(embedder: Embedder, texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = []
  for (const t of texts) out.push(await embedder.embed(t))
  return out
}
