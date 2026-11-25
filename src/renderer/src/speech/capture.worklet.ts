// AudioWorklet: collects mono 16 kHz samples into 512-sample frames (32 ms, Silero VAD frame size)
// and posts them straight to the speech worker through a MessagePort — never via the UI thread.

declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

const FRAME = 512

class CaptureProcessor extends AudioWorkletProcessor {
  private out: MessagePort | null = null
  private frame = new Float32Array(FRAME)
  private filled = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ port?: MessagePort }>) => {
      if (e.data.port) this.out = e.data.port
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel || !this.out) return true
    for (let i = 0; i < channel.length; i++) {
      this.frame[this.filled++] = channel[i]
      if (this.filled === FRAME) {
        this.out.postMessage(this.frame, [this.frame.buffer])
        this.frame = new Float32Array(FRAME)
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('pf-capture', CaptureProcessor)
