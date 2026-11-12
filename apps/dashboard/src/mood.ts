import type { ProjectStatus } from './projects'

export interface Mood {
  /** Strength of the hall's general light, around 1. */
  intensity: number
  /** Colour of that light, as red, green, blue from 0 to 1. */
  color: [number, number, number]
}

const NORMAL: [number, number, number] = [1, 0.933, 0.867]
const AMBER: [number, number, number] = [1, 0.69, 0.38]

/**
 * How the hall's light feels for a project: it breathes while running (more when busier), goes warm and
 * pulses slowly when the project needs you, and sinks lower when idle. `t` is seconds.
 */
export function moodFor(status: ProjectStatus, activity: number, t: number): Mood {
  const time = Number.isFinite(t) ? t : 0
  const busy = Number.isFinite(activity) ? Math.min(1, Math.max(0, activity)) : 0
  if (status === 'needs-you') {
    const k = 0.55 + 0.2 * Math.sin(time * 1.3)
    return { intensity: 1.05 + 0.07 * Math.sin(time * 1.3), color: NORMAL.map((v, i) => v + (AMBER[i] - v) * k) as [number, number, number] }
  }
  if (status === 'idle') return { intensity: 0.85, color: NORMAL }
  return { intensity: 1 + (0.03 + 0.05 * busy) * Math.sin(time * (0.5 + busy)), color: NORMAL }
}

/** How bright the hall's glowing rim should be, 0 to 1: steady while running, a slow pulse when it needs you, low when idle. */
export function stripGlow(status: ProjectStatus, t: number): number {
  if (status === 'idle') return 0.35
  if (status === 'needs-you') {
    const time = Number.isFinite(t) ? t : 0
    return 0.75 + 0.25 * Math.sin(time * 2.2)
  }
  return 1
}
