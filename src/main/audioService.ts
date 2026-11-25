import { app } from 'electron'

const CRASHES = 3
const WINDOW_MS = 10_000

/** True when the last `CRASHES` crashes all happened within `WINDOW_MS` (a crash loop, not a one-off). */
export function isCrashLoop(crashTimes: number[], now: number): boolean {
  const recent = crashTimes.filter((t) => now - t <= WINDOW_MS)
  return recent.length >= CRASHES
}

/**
 * Chromium's audio service is a separate process, started on demand. When it cannot start (e.g. the
 * app's runtime files were deleted underneath it) Chromium restarts it in a tight loop, and the
 * microphone APIs only report "no device". Calls `onBroken` once when that happens.
 */
export function watchAudioService(onBroken: () => void): void {
  let crashes: number[] = []
  let reported = false
  app.on('child-process-gone', (_e, details) => {
    if (reported || details.serviceName !== 'audio.mojom.AudioService' || details.reason === 'clean-exit') return
    const now = Date.now()
    crashes = [...crashes.slice(-(CRASHES - 1)), now]
    if (!isCrashLoop(crashes, now)) return
    reported = true
    onBroken()
  })
}
