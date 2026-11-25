import path from 'node:path'
import { safeStorage } from 'electron'
import type { CloudProviderId } from '@shared/types'
import { readJson, writeJsonAtomic } from './store'

/**
 * API keys encrypted with the OS keychain (DPAPI on Windows).
 * The renderer can only set/clear/check keys; decrypted keys never leave the main process.
 */
export class Secrets {
  private readonly file: string

  constructor(root: string) {
    this.file = path.join(root, 'secrets.json')
  }

  private load(): Partial<Record<CloudProviderId, string>> {
    return readJson(this.file, {})
  }

  has(provider: CloudProviderId): boolean {
    return Boolean(this.load()[provider])
  }

  set(provider: CloudProviderId, key: string): void {
    const trimmed = key.trim()
    if (!trimmed) return this.clear(provider)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('encryption-unavailable')
    const data = this.load()
    data[provider] = safeStorage.encryptString(trimmed).toString('base64')
    writeJsonAtomic(this.file, data)
  }

  clear(provider: CloudProviderId): void {
    const data = this.load()
    delete data[provider]
    writeJsonAtomic(this.file, data)
  }

  /** Main-process only. */
  get(provider: CloudProviderId): string | null {
    const enc = this.load()[provider]
    if (!enc) return null
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null
    }
  }
}
