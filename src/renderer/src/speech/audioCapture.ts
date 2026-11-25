import workletUrl from './capture.worklet.ts?worker&url'
import { micProblem, type MicProblem } from './micDevices'

export const SAMPLE_RATE = 16000

/**
 * Microphone → AudioWorklet (16 kHz mono) → MessagePort. The AudioContext runs at 16 kHz,
 * so Chromium does the resampling. Recovers automatically when the microphone disappears;
 * `onProblem` reports why it is unusable (`null` once it works again).
 */
export class AudioCapture {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private retryTimer: number | undefined
  private stopped = true

  constructor(
    private readonly deviceId: string | null,
    private readonly onProblem: (problem: MicProblem | null) => void
  ) {}

  /** Starts capturing and delivers frames to `port`. */
  async start(port: MessagePort): Promise<void> {
    this.stopped = false
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
    await this.ctx.audioWorklet.addModule(workletUrl)
    this.node = new AudioWorkletNode(this.ctx, 'pf-capture', { numberOfInputs: 1, numberOfOutputs: 0 })
    this.node.port.postMessage({ port }, [port])
    await this.connectMicrophone()
    navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange)
  }

  private onDeviceChange = () => {
    if (!this.stopped && !this.stream?.active) void this.connectMicrophone()
  }

  private async connectMicrophone(): Promise<void> {
    window.clearTimeout(this.retryTimer)
    try {
      this.stream?.getTracks().forEach((t) => t.stop())
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.deviceId ? { ideal: this.deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      if (this.stopped) return this.stream.getTracks().forEach((t) => t.stop())
      const source = this.ctx!.createMediaStreamSource(this.stream)
      source.connect(this.node!)
      this.stream.getAudioTracks()[0].addEventListener('ended', () => {
        this.onProblem('missing')
        this.scheduleRetry()
      })
      this.onProblem(null)
    } catch (err) {
      this.onProblem(micProblem(err))
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    window.clearTimeout(this.retryTimer)
    this.retryTimer = window.setTimeout(() => void this.connectMicrophone(), 2000)
  }

  async setPaused(paused: boolean): Promise<void> {
    if (!this.ctx) return
    if (paused) await this.ctx.suspend()
    else await this.ctx.resume()
  }

  async stop(): Promise<void> {
    this.stopped = true
    window.clearTimeout(this.retryTimer)
    navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.node?.disconnect()
    await this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.stream = null
    this.node = null
  }
}
