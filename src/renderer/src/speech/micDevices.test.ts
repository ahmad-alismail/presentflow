import { describe, expect, it } from 'vitest'
import { defaultDeviceName, micProblem } from './micDevices'

const mic = (deviceId: string, label: string) => ({ deviceId, label, kind: 'audioinput' as const })

describe('micProblem', () => {
  it.each([
    ['NotAllowedError', 'blocked'],
    ['SecurityError', 'blocked'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'busy'],
    ['NotFoundError', 'missing'],
    ['OverconstrainedError', 'missing']
  ])('%s → %s', (name, expected) => {
    expect(micProblem(new DOMException('x', name))).toBe(expected)
  })

  it('treats unknown errors as a missing microphone', () => {
    expect(micProblem(new Error('boom'))).toBe('missing')
    expect(micProblem(undefined)).toBe('missing')
  })
})

describe('defaultDeviceName', () => {
  it('resolves the default alias to the real device (Windows)', () => {
    const devices = [
      mic('default', 'Default - Mic Laptop (Realtek(R) Audio)'),
      mic('communications', 'Communications - Mic Laptop (Realtek(R) Audio)'),
      mic('e0c6', 'Mic Laptop (Realtek(R) Audio)'),
      mic('9a1f', 'Headset (Jabra Link 380)')
    ]
    expect(defaultDeviceName(devices)).toBe('Mic Laptop (Realtek(R) Audio)')
  })

  it('works with a localized prefix and prefers the longest matching label', () => {
    const devices = [mic('default', 'Standard - Externes Mikrofon (Realtek(R) Audio)'), mic('a', 'Mikrofon (Realtek(R) Audio)'), mic('b', 'Externes Mikrofon (Realtek(R) Audio)')]
    expect(defaultDeviceName(devices)).toBe('Externes Mikrofon (Realtek(R) Audio)')
  })

  it('ignores outputs and returns null without a usable default entry', () => {
    expect(defaultDeviceName([{ deviceId: 'default', label: 'Default - Speakers', kind: 'audiooutput' }, mic('x', 'Speakers')])).toBeNull()
    expect(defaultDeviceName([mic('default', ''), mic('x', 'Mic')])).toBeNull()
    expect(defaultDeviceName([])).toBeNull()
  })
})
