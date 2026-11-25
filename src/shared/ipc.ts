import type {
  CloudEvent,
  PowerPointState,
  CloudProviderId,
  CloudStartOptions,
  Presentation,
  PresentationMeta,
  SessionSnapshot,
  Settings,
  ShortcutAction,
  SpeechLanguage
} from './types'

/** IPC channel names — single source of truth for main and preload. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  presList: 'presentations:list',
  presGet: 'presentations:get',
  presSave: 'presentations:save',
  presDelete: 'presentations:delete',
  presImport: 'presentations:import',
  sessionGet: 'session:get',
  sessionSave: 'session:save',
  sessionClear: 'session:clear',
  secretHas: 'secret:has',
  secretSet: 'secret:set',
  secretClear: 'secret:clear',
  cloudStart: 'cloud:start',
  cloudAudio: 'cloud:audio',
  cloudCommit: 'cloud:commit',
  cloudStop: 'cloud:stop',
  cloudEvent: 'cloud:event',
  shortcut: 'shortcut',
  pptWatch: 'ppt:watch',
  pptState: 'ppt:state',
  audioServiceFailed: 'audio:service-failed'
} as const

/** API exposed on `window.presentflow` by the preload script. */
export interface PresentFlowApi {
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    onChange(cb: (s: Settings) => void): () => void
  }
  presentations: {
    list(): Promise<PresentationMeta[]>
    get(id: string): Promise<Presentation | null>
    save(p: Presentation): Promise<void>
    delete(id: string): Promise<void>
    /** Opens a file dialog (.md, .txt, .pptx); resolves to title + script, or null if cancelled. */
    importFile(): Promise<{ title: string; source: string; language?: SpeechLanguage } | null>
  }
  sessions: {
    get(presentationId: string): Promise<SessionSnapshot | null>
    save(snapshot: SessionSnapshot): Promise<void>
    clear(presentationId: string): Promise<void>
  }
  secrets: {
    has(provider: CloudProviderId): Promise<boolean>
    set(provider: CloudProviderId, key: string): Promise<void>
    clear(provider: CloudProviderId): Promise<void>
  }
  cloud: {
    start(opts: CloudStartOptions): Promise<void>
    /** PCM16 little-endian mono, 16 kHz (resampled in the main process where a provider needs 24 kHz). */
    audio(chunk: ArrayBuffer): void
    /** End of the current speech turn (from the shared VAD). */
    commit(): void
    stop(): Promise<void>
    onEvent(cb: (e: CloudEvent) => void): () => void
  }
  onShortcut(cb: (action: ShortcutAction) => void): () => void
  powerpoint: {
    /** Start/stop following PowerPoint; resolves with the current state. */
    watch(on: boolean): Promise<PowerPointState>
    onState(cb: (s: PowerPointState) => void): () => void
  }
  /** Chromium's audio service keeps crashing: the microphone cannot work until PresentFlow restarts. */
  onAudioServiceFailed(cb: () => void): () => void
}
