/** Why the microphone cannot be used. */
export type MicProblem = 'blocked' | 'missing' | 'busy'

/** Maps a getUserMedia failure to something the presenter can act on. */
export function micProblem(err: unknown): MicProblem {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked'
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy'
  return 'missing'
}

type Device = Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>

const isAlias = (d: Device) => d.deviceId === 'default' || d.deviceId === 'communications'

/**
 * The real device behind Chromium's "default" entry. Its label is "<localized Default> - <name>",
 * so match the longest real label it ends with (groupId is shared by several mics on one codec).
 */
export function defaultDeviceName(devices: Device[]): string | null {
  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const alias = inputs.find((d) => d.deviceId === 'default')?.label
  if (!alias) return null
  const match = inputs
    .filter((d) => !isAlias(d) && d.label && alias.endsWith(d.label))
    .sort((a, b) => b.label.length - a.label.length)[0]
  return match?.label ?? null
}

export interface Microphones {
  /** Selectable devices (without the "default"/"communications" aliases). */
  devices: MediaDeviceInfo[]
  /** What "Default microphone" currently resolves to, if known. */
  defaultName: string | null
}

export async function listMicrophones(): Promise<Microphones> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return {
    devices: all.filter((d) => d.kind === 'audioinput' && !isAlias(d)),
    defaultName: defaultDeviceName(all)
  }
}
