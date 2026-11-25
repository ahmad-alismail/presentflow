import type { EmbedIn, EmbedOut } from './embed.worker'

/**
 * Client for the embedding worker. `embedLatest` coalesces: while one request runs, only the
 * newest pending text is kept, so a fast speaker never builds up a backlog.
 */
export class Embedder {
  private worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' })
  private nextId = 0
  private waiting = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>()
  private busy = false
  private latest: { text: string; resolve: (v: Float32Array | null) => void } | null = null

  constructor() {
    this.worker.onmessage = (e: MessageEvent<EmbedOut>) => {
      const w = this.waiting.get(e.data.id)
      if (!w) return
      this.waiting.delete(e.data.id)
      if (e.data.vectors) w.resolve(e.data.vectors)
      else w.reject(new Error(e.data.error ?? 'embedding failed'))
    }
  }

  embedMany(texts: string[]): Promise<Float32Array[]> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.worker.postMessage({ id, texts } satisfies EmbedIn)
    })
  }

  /** Resolves with the vector, or null if a newer request superseded this one. */
  embedLatest(text: string): Promise<Float32Array | null> {
    return new Promise((resolve) => {
      this.latest?.resolve(null)
      this.latest = { text, resolve }
      void this.run()
    })
  }

  private async run(): Promise<void> {
    if (this.busy || !this.latest) return
    const job = this.latest
    this.latest = null
    this.busy = true
    try {
      const [v] = await this.embedMany([job.text])
      job.resolve(v)
    } catch {
      job.resolve(null)
    } finally {
      this.busy = false
      void this.run()
    }
  }

  dispose(): void {
    this.worker.terminate()
  }
}
