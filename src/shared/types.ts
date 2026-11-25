// Types shared by the main process, preload and renderer.
import type { TrackerSnapshot } from '../core/tracking/tracker'

export type UiLanguage = 'de' | 'en'
export type SpeechLanguage = 'de' | 'en'
export type ThemeMode = 'system' | 'light' | 'dark'
export type ProviderId = 'local' | 'openai' | 'gemini'
export type CloudProviderId = Exclude<ProviderId, 'local'>
export type LocalModelId = 'whisper-large-v3-turbo' | 'whisper-small'
/** With PowerPoint: stay on the slide until the presenter clicks (manual), or let speech move on (auto). */
export type SlideAdvance = 'manual' | 'auto'

export interface Settings {
  uiLanguage: UiLanguage
  theme: ThemeMode
  highContrast: boolean
  /** Font size of the current sentence in px. */
  fontSize: number
  lineHeight: number
  /** Number of upcoming sentences shown below the current one (1–2). */
  upcomingCount: 1 | 2
  /** Sidebar share of the content width (0.2–0.45). */
  sidebarRatio: number
  /** Font size of the sidebar's section outline in px (slide list and open points scale with it). */
  navFontSize: number
  /** Window opacity (0.5–1). */
  opacity: number
  alwaysOnTop: boolean
  globalShortcuts: boolean
  emphasizeKeywords: boolean
  provider: ProviderId
  localModel: LocalModelId
  microphoneId: string | null
  openaiModel: string
  geminiModel: string
  /** Explicit consent to send microphone audio to a cloud provider. */
  cloudConsent: Record<CloudProviderId, boolean>
  /** Switch to the local engine when a cloud provider keeps failing. */
  fallbackToLocal: boolean
  /** Follow the slide PowerPoint shows ("the slide decides"). */
  followPowerPoint: boolean
  /** How PresentFlow gets to the next slide while following PowerPoint. */
  slideAdvance: SlideAdvance
}

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'de',
  theme: 'system',
  highContrast: false,
  fontSize: 34,
  lineHeight: 1.4,
  upcomingCount: 2,
  sidebarRatio: 0.3,
  navFontSize: 24,
  opacity: 1,
  alwaysOnTop: true,
  globalShortcuts: true,
  emphasizeKeywords: true,
  provider: 'local',
  localModel: 'whisper-large-v3-turbo',
  microphoneId: null,
  openaiModel: 'gpt-live-transcribe',
  geminiModel: 'gemini-3.5-transcribe-live',
  cloudConsent: { openai: false, gemini: false },
  fallbackToLocal: true,
  followPowerPoint: true,
  slideAdvance: 'manual'
}

export interface Presentation {
  id: string
  title: string
  language: SpeechLanguage
  /** Markdown / plain-text script — the authoritative source. */
  source: string
  /** User-approved memory cues keyed by sentence key (see core/script). */
  cues: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface PresentationMeta {
  id: string
  title: string
  language: SpeechLanguage
  updatedAt: number
}

/** Saved rehearsal progress for one presentation. */
export interface SessionSnapshot extends TrackerSnapshot {
  presentationId: string
  savedAt: number
}

/** Provider-agnostic transcript event. `text` is the cumulative text of the utterance so far. */
export interface TranscriptEvent {
  utteranceId: string
  kind: 'partial' | 'final'
  text: string
}

export type SpeechState = 'idle' | 'loading' | 'listening' | 'paused' | 'reconnecting' | 'error'

export interface SpeechStatus {
  state: SpeechState
  /** True while the VAD detects voice. Drives the "hearing you" dot. */
  hearing?: boolean
  /** Machine-readable reason, translated in the UI. */
  detail?: string
  /** Model download/load progress 0..1 while loading. */
  progress?: number
}

export interface CloudStartOptions {
  provider: CloudProviderId
  model: string
  language: SpeechLanguage
  vocabulary: string[]
}

export type CloudEvent =
  | { type: 'transcript'; event: TranscriptEvent }
  | { type: 'status'; state: 'connecting' | 'ready' | 'reconnecting' | 'failed' | 'closed'; detail?: string }

/** What PowerPoint currently shows (from the main-process watcher). */
export interface PowerPointState {
  connected: boolean
  mode?: 'show' | 'edit'
  /** 1-based slide index in the presentation. */
  slide?: number
  count?: number
  title?: string
  file?: string
}

export type ShortcutAction = 'rescue' | 'next' | 'back' | 'focus' | 'pause' | 'undoJump'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}
