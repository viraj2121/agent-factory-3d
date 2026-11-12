import { useSyncExternalStore } from 'react'
import { MODES, type Mode } from './quality'
import { THEME_IDS, type ThemeId } from './themes'
import { SCENERY_LEVELS, type Scenery } from './scenery'

// The dashboard's display choices: one small store that the Settings panel, the scene (inside the Canvas too, as it
// is not React context) and the buttons share. Saved in this browser; when the agent service runs, also kept in its
// settings file (`display` in ~/.ai-factory/settings.json), which wins when the page opens.

export type LabelMode = 'all' | 'names' | 'none'
export type MotionMode = 'system' | 'reduced' | 'full'
export const TOUR_CHOICES = [0, 15, 30, 60] as const

export interface UiSettings {
  quality: Mode
  showFps: boolean
  labels: LabelMode
  glassBlur: boolean
  motion: MotionMode
  /** Seconds with nothing touched before the camera tour starts; 0 = off. */
  tourSeconds: number
  /** The look of space around the hub. */
  theme: ThemeId
  /** Dust, meteors and ion storms outside the dome. */
  spaceWeather: boolean
  /** The project rail on the left is unfolded. */
  railOpen: boolean
  /** How much decoration the hall shows: everything, calm (the default) or only what is real. */
  scenery: Scenery
}

export const DEFAULT_UI: UiSettings = { quality: 'auto', showFps: true, labels: 'all', glassBlur: true, motion: 'system', tourSeconds: 30, theme: 'deep', spaceWeather: true, railOpen: true, scenery: 'calm' }

const KEY = 'hub-settings'
const LABELS: LabelMode[] = ['all', 'names', 'none']
const MOTIONS: MotionMode[] = ['system', 'reduced', 'full']

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

/** Settings from anything (saved text, the service's `display`): each wrong value falls back to its default. */
export function parseUi(input: unknown, base: UiSettings = DEFAULT_UI): UiSettings {
  const r = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  return {
    quality: pick(r.quality, MODES, base.quality),
    showFps: bool(r.showFps, base.showFps),
    labels: pick(r.labels, LABELS, base.labels),
    glassBlur: bool(r.glassBlur, base.glassBlur),
    motion: pick(r.motion, MOTIONS, base.motion),
    tourSeconds: pick(r.tourSeconds, TOUR_CHOICES as readonly number[], base.tourSeconds),
    theme: pick(r.theme, THEME_IDS, base.theme),
    spaceWeather: bool(r.spaceWeather, base.spaceWeather),
    railOpen: bool(r.railOpen, base.railOpen),
    scenery: pick(r.scenery, SCENERY_LEVELS, base.scenery),
  }
}

/** The form the service keeps: plain values only. */
export function toDisplay(ui: UiSettings): Record<string, string | number | boolean> {
  return { ...ui }
}

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void }

export interface UiStore {
  get(): UiSettings
  set(change: Partial<UiSettings>): void
  replace(input: unknown): void
  subscribe(fn: () => void): () => void
}

export function createUiStore(storage: Storage | null): UiStore {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  let current: UiSettings
  const saved = read(KEY)
  if (saved) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(saved)
    } catch {
      parsed = null
    }
    current = parseUi(parsed)
  } else {
    // choices saved one by one by earlier versions of the page
    const tour = read('hub-tour')
    current = parseUi({ quality: read('hub-quality'), tourSeconds: tour === 'off' ? 0 : undefined })
  }
  const listeners = new Set<() => void>()
  const commit = (next: UiSettings) => {
    if (JSON.stringify(next) === JSON.stringify(current)) return
    current = next
    try {
      storage?.setItem(KEY, JSON.stringify(current))
    } catch {
      // the choice still applies for this visit
    }
    listeners.forEach((fn) => fn())
  }
  return {
    get: () => current,
    set: (change) => commit(parseUi(change, current)),
    replace: (input) => commit(parseUi(input)),
    subscribe: (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

/** The one store of this page. */
export const uiStore: UiStore = createUiStore(typeof window !== 'undefined' ? window.localStorage : null)

export function useUi(): UiSettings {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get)
}

/** Which labels show: bay bubbles and data tags far away, agent names up close, island names in the sky. */
export function labelsFor(mode: LabelMode, close: boolean): { bubbles: boolean; names: boolean; islands: boolean } {
  if (mode === 'none') return { bubbles: false, names: false, islands: false }
  return { bubbles: mode === 'all' && !close, names: close, islands: !close }
}

export function reducedMotion(mode: MotionMode, systemAsks: boolean): boolean {
  return mode === 'system' ? systemAsks : mode === 'reduced'
}
