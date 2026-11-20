import { hashString } from '../bayShapes'
import type { WidgetRow, WidgetState } from '../widgetRows'

// The widget's Orbit: you are the light in the middle and every agent circles you. How close it is shows how much it needs
// you (waiting agents on the inner ring, pulling in the longer they wait), working ones circle fast, resting ones drift
// at the edge. Also how see-through the window is when left alone, and where it goes when docked to the screen edge.

/** Distances from you, as a share of the sky's radius. */
export const RING: Record<WidgetState, number> = { wait: 0.38, run: 0.66, rest: 0.92 }
/** How far a waiting agent can be pulled in (it gets there after 15 minutes). */
const WAIT_PULL = 0.16
const WAIT_FULL_MIN = 15

export interface OrbitSpot {
  /** Distance from you, 0 to 1. */
  radius: number
  /** Radians a second. */
  speed: number
  /** Starting angle, stable for the agent. */
  phase: number
}

export function orbitSpot(row: Pick<WidgetRow, 'key' | 'state' | 'sinceMs'>): OrbitSpot {
  const phase = ((hashString(row.key) % 62_832) / 62_832) * Math.PI * 2
  if (row.state === 'wait') {
    const min = Math.min(WAIT_FULL_MIN, (row.sinceMs ?? 0) / 60_000)
    return { radius: RING.wait - (WAIT_PULL * min) / WAIT_FULL_MIN, speed: 0, phase }
  }
  if (row.state === 'run') return { radius: RING.run, speed: 0.55, phase }
  return { radius: RING.rest, speed: 0.06, phase }
}

/** The agents shown in the sky: all that wait or work, then the newest resting ones up to the limit. Rows come sorted from
 *  widgetRows (waiting, working, resting, newest first within each). */
export function orbitPick<T extends Pick<WidgetRow, 'state'>>(rows: T[], max = 14): T[] {
  const busy = rows.filter((r) => r.state !== 'rest')
  return [...busy, ...rows.filter((r) => r.state === 'rest').slice(0, Math.max(0, max - busy.length))]
}

/** Left alone this long, the window fades. */
export const FADE_AFTER_MS = 8_000
/** How solid a faded window stays (percent). */
export const FADED = 35
/** A new waiting agent brings the window back for this long. */
export const ALERT_HOLD_MS = 15_000

export function opacityFor(s: { hovered: boolean; sinceTouchMs: number; sinceAlertMs: number; enabled: boolean }): number {
  if (!s.enabled || s.hovered || s.sinceTouchMs < FADE_AFTER_MS || s.sinceAlertMs < ALERT_HOLD_MS) return 100
  return FADED
}

/** The part of the docked window that stays in view at the screen edge (outer pixels, frame included). */
export const TAB = { width: 60, height: 210 }

/** Where the window goes when docked: its left edge shows as a tab at the right of the screen, half way down. Edge keeps app
 *  windows a few hundred pixels wide, so the window keeps its width and the rest of it waits off screen. */
export function dockPlace(screen: { left: number; top: number; width: number; height: number }, outerWidth: number) {
  return {
    x: screen.left + screen.width - TAB.width,
    y: screen.top + Math.round((screen.height - TAB.height) / 2),
    width: Math.max(TAB.width, Math.round(outerWidth)),
    height: TAB.height,
  }
}
