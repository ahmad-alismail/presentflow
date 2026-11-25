import { create } from 'zustand'
import { DEFAULT_SETTINGS, type PowerPointState, type Settings, type SpeechStatus } from '@shared/types'
import type { TrackerView } from '@core/tracking/tracker'

export type Screen =
  | { name: 'library' }
  | { name: 'editor'; id: string }
  | { name: 'rehearsal'; id: string }
  | { name: 'summary'; id: string }

export type RunState = 'idle' | 'running' | 'paused'

interface AppState {
  settings: Settings
  screen: Screen
  settingsOpen: boolean
  // Rehearsal (owned by RehearsalSession, read by views)
  view: TrackerView | null
  status: SpeechStatus
  /** The audio service crashes on every start; only a restart of PresentFlow helps. */
  audioBroken: boolean
  run: RunState
  /** 0 = off, 1 = cue, 2 = cue + full sentence. */
  rescue: 0 | 1 | 2
  /** Frozen view while Focus Lock is on (tracking continues underneath). */
  frozen: TrackerView | null
  /** Live PowerPoint link: what it shows and whether the script has text for that slide. */
  ppt: { state: PowerPointState; matched: boolean } | null

  setScreen(screen: Screen): void
  setSettingsOpen(open: boolean): void
  updateSettings(patch: Partial<Settings>): Promise<void>
}

export const useApp = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  screen: { name: 'library' },
  settingsOpen: false,
  view: null,
  status: { state: 'idle' },
  audioBroken: false,
  run: 'idle',
  rescue: 0,
  frozen: null,
  ppt: null,

  setScreen: (screen) => set({ screen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  updateSettings: async (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } })) // optimistic
    const saved = await window.presentflow.settings.set(patch)
    set({ settings: saved })
  }
}))

/** The view the presenter sees: frozen while Focus Lock is on. */
export function useDisplayedView(): TrackerView | null {
  return useApp((s) => s.frozen ?? s.view)
}
