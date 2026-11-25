import { app } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCrashLoop, watchAudioService } from './audioService'

vi.mock('electron', async () => ({ app: new (await import('node:events')).EventEmitter() }))

const AUDIO = { type: 'Utility', serviceName: 'audio.mojom.AudioService', name: 'Audio Service', reason: 'crashed', exitCode: -2147483645 }
const gone = (details: object) => app.emit('child-process-gone', {}, details)

describe('isCrashLoop', () => {
  it('needs three crashes within ten seconds', () => {
    expect(isCrashLoop([1000, 2000], 2000)).toBe(false)
    expect(isCrashLoop([1000, 2000, 3000], 3000)).toBe(true)
    expect(isCrashLoop([0, 6000, 12_000], 12_000)).toBe(false)
  })
})

describe('watchAudioService', () => {
  afterEach(() => {
    app.removeAllListeners()
    vi.useRealTimers()
  })

  it('reports a crash loop of the audio service once', () => {
    const onBroken = vi.fn()
    watchAudioService(onBroken)
    for (let i = 0; i < 50; i++) gone(AUDIO)
    expect(onBroken).toHaveBeenCalledTimes(1)
  })

  it('ignores other processes, clean exits and isolated crashes', () => {
    vi.useFakeTimers()
    const onBroken = vi.fn()
    watchAudioService(onBroken)
    for (let i = 0; i < 5; i++) {
      gone({ ...AUDIO, serviceName: 'network.mojom.NetworkService' })
      gone({ ...AUDIO, reason: 'clean-exit' })
    }
    for (let i = 0; i < 5; i++) {
      gone(AUDIO) // one crash every 6 s: Chromium recovers in between
      vi.advanceTimersByTime(6000)
    }
    expect(onBroken).not.toHaveBeenCalled()
  })
})
