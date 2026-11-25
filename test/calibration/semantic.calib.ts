// Run with: npm run calibrate
// Prints semantic similarity distributions for threshold calibration (run explicitly).
import { it } from 'vitest'
import { asr, sample, sentenceId } from '../helpers'
import { embedAll, nodeEmbedder } from '../embedder'

const targets: Record<string, [number, number]> = {
  'p-begruessung-1': [1, 1], 'p-ausgangslage-1': [2, 1], 'p-testumgebung-2': [3, 2], 'p-konkurrenz-1': [4, 1],
  'p-shutdown-1': [5, 1], 'p-shutdown-3': [5, 3], 'p-warum-1': [6, 1], 'p-gegen-3': [7, 3],
  'p-ressourcen-1': [8, 1], 'p-ueberleitung-1': [9, 1], 'f-testumgebung-1': [3, 1], 'f-warum-1': [6, 1],
  'partial-ausgangslage-2': [2, 2], offtopic: [1, 2], 'title-gegen': [7, 1]
}
it('calibration', async () => {
  const e = nodeEmbedder()
  const texts = sample.sentences.map((s) => s.text)
  const vecs = await embedAll(e, texts)
  const order = sample.sentences.map((s) => s.id)
  for (const [clip, [sec, i]] of Object.entries(targets)) {
    const v = await e.embed(asr[clip])
    const sims = vecs.map((x) => x.reduce((a, b, k) => a + b * v[k], 0))
    const ti = order.indexOf(sentenceId(sample, sec, i))
    const neighbours = [ti - 2, ti - 1, ti + 1, ti + 2].filter((k) => k >= 0 && k < sims.length)
    const nearMax = Math.max(...neighbours.map((k) => sims[k]))
    const others = sims.map((s, k) => (k === ti ? -1 : s))
    const globalMax = Math.max(...others)
    console.log(`${clip.padEnd(24)} target=${sims[ti].toFixed(3)} near=${nearMax.toFixed(3)} margin=${(sims[ti] - nearMax).toFixed(3)} otherMax=${globalMax.toFixed(3)} (${texts[others.indexOf(globalMax)].slice(0, 40)})`)
  }
})
