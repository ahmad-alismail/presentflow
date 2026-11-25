import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  type Presentation,
  type PresentationMeta,
  type SessionSnapshot,
  type Settings,
  type WindowState
} from '@shared/types'

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function assertId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid id: ${id}`)
  return id
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Write via temp file + rename so a crash never leaves a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

/** All persistent app data, as JSON files under the user-data directory. */
export class Store {
  private cachedSettings: Settings | null = null

  constructor(private readonly root: string) {}

  private file(...parts: string[]): string {
    return path.join(this.root, ...parts)
  }

  isFirstRun(): boolean {
    return !fs.existsSync(this.file('settings.json'))
  }

  getSettings(): Settings {
    if (!this.cachedSettings) {
      const saved = readJson<Partial<Settings>>(this.file('settings.json'), {})
      this.cachedSettings = mergeSettings(DEFAULT_SETTINGS, saved)
    }
    return this.cachedSettings
  }

  setSettings(patch: Partial<Settings>): Settings {
    const next = mergeSettings(this.getSettings(), patch)
    this.cachedSettings = next
    writeJsonAtomic(this.file('settings.json'), next)
    return next
  }

  getWindowState(): WindowState | null {
    return readJson<WindowState | null>(this.file('window-state.json'), null)
  }

  setWindowState(state: WindowState): void {
    writeJsonAtomic(this.file('window-state.json'), state)
  }

  listPresentations(): PresentationMeta[] {
    const dir = this.file('presentations')
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<Presentation | null>(path.join(dir, f), null))
      .filter((p): p is Presentation => p !== null)
      .map(({ id, title, language, updatedAt }) => ({ id, title, language, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getPresentation(id: string): Presentation | null {
    return readJson<Presentation | null>(this.file('presentations', `${assertId(id)}.json`), null)
  }

  savePresentation(p: Presentation): void {
    writeJsonAtomic(this.file('presentations', `${assertId(p.id)}.json`), p)
  }

  deletePresentation(id: string): void {
    fs.rmSync(this.file('presentations', `${assertId(id)}.json`), { force: true })
    this.clearSession(id)
  }

  getSession(presentationId: string): SessionSnapshot | null {
    return readJson<SessionSnapshot | null>(this.file('sessions', `${assertId(presentationId)}.json`), null)
  }

  saveSession(snapshot: SessionSnapshot): void {
    writeJsonAtomic(this.file('sessions', `${assertId(snapshot.presentationId)}.json`), snapshot)
  }

  clearSession(presentationId: string): void {
    fs.rmSync(this.file('sessions', `${assertId(presentationId)}.json`), { force: true })
  }
}

function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  return {
    ...base,
    ...patch,
    cloudConsent: { ...base.cloudConsent, ...(patch.cloudConsent ?? {}) }
  }
}
