// Speech worker: Silero VAD for every provider; local Whisper (WebGPU) in 'local' mode.
//
// Local streaming = re-transcribe the open utterance every ~700 ms (partials) + one final pass when
// the VAD detects the end of speech. In 'vad' mode (cloud providers) it forwards only speech audio
// as PCM16 and signals turn ends, so silence is never sent (cheaper, fewer hallucinations).
import {
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  ModelRegistry,
  Tensor,
  WhisperForConditionalGeneration,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor
} from '@huggingface/transformers'
import type { LocalModelId, SpeechLanguage } from '@shared/types'
import { cleanTranscript } from './hallucination'
import { VAD_MODEL, WHISPER, WHISPER_CPU, WHISPER_LANGUAGE, type WhisperSpec } from './models'

export type WorkerIn =
  | { type: 'init'; mode: 'local' | 'vad'; model: LocalModelId; language: SpeechLanguage; port: MessagePort }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'prefetch'; model: LocalModelId }
  | { type: 'isCached'; model: LocalModelId }

export type WorkerOut =
  | { type: 'progress'; progress: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'error'; message: string }
  | { type: 'vad'; speaking: boolean }
  | { type: 'transcript'; utteranceId: string; kind: 'partial' | 'final'; text: string }
  | { type: 'pcm'; data: ArrayBuffer }
  | { type: 'turnEnd' }
  | { type: 'cached'; model: LocalModelId; value: boolean }
  | { type: 'prefetched'; model: LocalModelId }

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)

// ── VAD parameters (Silero, 512-sample frames = 32 ms @ 16 kHz) ──
const FRAME_MS = 32
const SPEECH_THRESHOLD = 0.3
const EXIT_THRESHOLD = 0.1
const MIN_SILENCE_FRAMES = Math.round(450 / FRAME_MS)
const MIN_SPEECH_FRAMES = Math.round(250 / FRAME_MS)
const PREROLL_FRAMES = 8 // 256 ms kept before speech onset
const PARTIAL_EVERY_FRAMES = Math.round(700 / FRAME_MS)
const MAX_UTTERANCE_FRAMES = Math.round(12000 / FRAME_MS)

let mode: 'local' | 'vad' = 'local'
let language = 'german'
let paused = false

// ── model loading with aggregated progress ──
function progressTracker() {
  const files = new Map<string, { loaded: number; total: number }>()
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
    let loaded = 0
    let total = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
    }
    post({ type: 'progress', progress: total ? loaded / total : 0 })
  }
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  return Boolean(gpu && (await gpu.requestAdapter().catch(() => null)))
}

let vad: PreTrainedModel | null = null
let vadState = new Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
const vadRate = new Tensor('int64', BigInt64Array.from([16000n]), [])

async function loadVad(): Promise<void> {
  vad ??= await AutoModel.from_pretrained(VAD_MODEL, { config: { model_type: 'custom' } as never, dtype: 'fp32', device: 'wasm' })
}

async function speechProbability(frame: Float32Array): Promise<number> {
  const out = (await vad!({ input: new Tensor('float32', frame, [1, 512]), sr: vadRate, state: vadState })) as {
    output: Tensor
    stateN: Tensor
  }
  vadState = out.stateN
  return (out.output.data as Float32Array)[0]
}

interface Whisper {
  processor: Processor
  tokenizer: PreTrainedTokenizer
  model: PreTrainedModel
}
let whisper: Whisper | null = null

async function loadWhisper(spec: WhisperSpec, device: 'webgpu' | 'wasm', onProgress = progressTracker()): Promise<Whisper> {
  const [processor, tokenizer, model] = await Promise.all([
    AutoProcessor.from_pretrained(spec.id, { progress_callback: onProgress }),
    AutoTokenizer.from_pretrained(spec.id, { progress_callback: onProgress }),
    WhisperForConditionalGeneration.from_pretrained(spec.id, { dtype: spec.dtype as never, device, progress_callback: onProgress })
  ])
  return { processor, tokenizer, model }
}

async function transcribe(audio: Float32Array): Promise<string> {
  const { processor, tokenizer, model } = whisper!
  const inputs = await processor(audio)
  const seconds = audio.length / 16000
  const ids = await model.generate({
    ...(inputs as object),
    language,
    task: 'transcribe',
    max_new_tokens: Math.min(160, Math.round(16 + seconds * 9))
  } as never)
  const text = tokenizer.batch_decode(ids as never, { skip_special_tokens: true })[0] ?? ''
  return cleanTranscript(text, seconds)
}

// ── utterance state ──
let speaking = false
let silenceFrames = 0
let utterance: Float32Array[] = []
let preroll: Float32Array[] = []
let utteranceSeq = 0
let utteranceId = ''
let framesAtLastPass = 0
let pcmBatch: Float32Array[] = []
let busy = false
const finalJobs: { id: string; audio: Float32Array }[] = []
const finalized = new Set<string>()

function concat(frames: Float32Array[]): Float32Array {
  const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0))
  let o = 0
  for (const f of frames) {
    out.set(f, o)
    o += f.length
  }
  return out
}

function toPcm16(frames: Float32Array[]): ArrayBuffer {
  const f = concat(frames)
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff
  return out.buffer
}

function flushPcm(): void {
  if (!pcmBatch.length) return
  const data = toPcm16(pcmBatch)
  pcmBatch = []
  post({ type: 'pcm', data }, [data])
}

function startUtterance(): void {
  speaking = true
  silenceFrames = 0
  utterance = [...preroll]
  framesAtLastPass = 0
  utteranceId = `l${Date.now().toString(36)}-${utteranceSeq++}`
  post({ type: 'vad', speaking: true })
  if (mode === 'vad') pcmBatch.push(...preroll)
}

function endUtterance(force = false): void {
  const speechFrames = utterance.length - silenceFrames
  speaking = false
  post({ type: 'vad', speaking: false })
  if (mode === 'vad') {
    flushPcm()
    post({ type: 'turnEnd' })
  } else if (speechFrames >= MIN_SPEECH_FRAMES || force) {
    // Keep ~100 ms of trailing silence, drop the rest.
    const keep = utterance.length - Math.max(0, silenceFrames - 3)
    finalJobs.push({ id: utteranceId, audio: concat(utterance.slice(0, keep)) })
    pump()
  }
  utterance = []
  silenceFrames = 0
}

/** Split an over-long utterance at its quietest frame within the last 2 s. */
function splitLongUtterance(): void {
  const window = Math.round(2000 / FRAME_MS)
  let cut = utterance.length - 1
  let minEnergy = Infinity
  for (let i = utterance.length - window; i < utterance.length; i++) {
    const f = utterance[i]
    let e = 0
    for (let k = 0; k < f.length; k++) e += f[k] * f[k]
    if (e < minEnergy) {
      minEnergy = e
      cut = i
    }
  }
  const rest = utterance.slice(cut + 1)
  utterance = utterance.slice(0, cut + 1)
  endUtterance(true)
  startUtterance()
  utterance = rest
}

function pump(): void {
  if (busy || !whisper) return
  let job: { id: string; kind: 'partial' | 'final'; audio: Float32Array } | null = null
  const fin = finalJobs.shift()
  if (fin) job = { ...fin, kind: 'final' }
  else if (speaking && utterance.length - framesAtLastPass >= PARTIAL_EVERY_FRAMES && utterance.length > MIN_SPEECH_FRAMES) {
    framesAtLastPass = utterance.length
    job = { id: utteranceId, kind: 'partial', audio: concat(utterance) }
  }
  if (!job) return
  busy = true
  const current = job
  transcribe(current.audio)
    .then((text) => {
      if (current.kind === 'partial' && finalized.has(current.id)) return
      if (current.kind === 'final') finalized.add(current.id)
      if (text || current.kind === 'final') post({ type: 'transcript', utteranceId: current.id, kind: current.kind, text })
    })
    .catch((err) => post({ type: 'error', message: String(err) }))
    .finally(() => {
      busy = false
      pump()
    })
}

// Frames are processed strictly in order; VAD inference is async.
const queue: Float32Array[] = []
let draining = false
async function drain(): Promise<void> {
  if (draining) return
  draining = true
  while (queue.length) {
    const frame = queue.shift()!
    if (paused || !vad) continue
    const p = await speechProbability(frame)
    if (!speaking) {
      preroll.push(frame)
      if (preroll.length > PREROLL_FRAMES) preroll.shift()
      if (p >= SPEECH_THRESHOLD) startUtterance()
      continue
    }
    utterance.push(frame)
    if (mode === 'vad') {
      pcmBatch.push(frame)
      if (pcmBatch.length >= 3) flushPcm()
    }
    if (p < EXIT_THRESHOLD) silenceFrames++
    else if (p >= SPEECH_THRESHOLD) silenceFrames = 0
    if (silenceFrames >= MIN_SILENCE_FRAMES) endUtterance()
    else if (utterance.length >= MAX_UTTERANCE_FRAMES && mode === 'local') splitLongUtterance()
    if (mode === 'local') pump()
  }
  draining = false
}

function specFor(model: LocalModelId, device: 'webgpu' | 'wasm'): WhisperSpec {
  return device === 'webgpu' ? WHISPER[model] : WHISPER_CPU
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data
  try {
    switch (m.type) {
      case 'init': {
        mode = m.mode
        language = WHISPER_LANGUAGE[m.language]
        const progress = progressTracker()
        await loadVad()
        let device: 'webgpu' | 'wasm' = 'wasm'
        if (mode === 'local') {
          device = (await hasWebGpu()) ? 'webgpu' : 'wasm'
          whisper ??= await loadWhisper(specFor(m.model, device), device, progress)
          await transcribe(new Float32Array(16000)) // warm-up: compile shaders before the speaker starts
        }
        m.port.onmessage = (ev: MessageEvent<Float32Array>) => {
          queue.push(ev.data)
          void drain()
        }
        post({ type: 'ready', device })
        break
      }
      case 'pause':
        paused = true
        if (speaking) endUtterance()
        break
      case 'resume':
        paused = false
        preroll = []
        break
      case 'prefetch': {
        const device = (await hasWebGpu()) ? 'webgpu' : 'wasm'
        const w = await loadWhisper(specFor(m.model, device), device)
        await w.model.dispose()
        post({ type: 'prefetched', model: m.model })
        break
      }
      case 'isCached': {
        const device = (await hasWebGpu()) ? 'webgpu' : 'wasm'
        const spec = specFor(m.model, device)
        const value = await ModelRegistry.is_pipeline_cached('automatic-speech-recognition', spec.id, {
          dtype: spec.dtype as never,
          device
        }).catch(() => false)
        post({ type: 'cached', model: m.model, value })
        break
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
