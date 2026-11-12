import { DEPARTMENTS } from './hallLayout'
import type { RosterState } from './live/wire'
import type { Project } from './projects'

// The core shows the crew as a ring of small lights: one light for every agent that has a seat in the project, lit by its
// real state. Everything here is plain maths, so it is tested; the drawing is in RosterCore.tsx.

export type CoreState = RosterState
export interface CoreLight {
  id: string
  state: CoreState
}

/** The ring holds at most this many lights. */
export const CORE_MAX = 16

const ACTIVE = (s: CoreState): boolean => s === 'running' || s === 'needs-you'

/**
 * The lights of a project, in a stable order (bay first, then id) so an agent keeps its place on the ring when another
 * one changes state. Over the limit, every working or waiting agent stays and the quiet ones are cut. Demo projects get
 * lights from their demo robots (and a couple resting ones): they are demo data, like the rest of that project.
 */
export function coreRoster(project: Project): CoreLight[] {
  const roster = project.live?.roster
  if (!roster) return demoLights(project)
  const bay = (d: string) => DEPARTMENTS.indexOf(d as (typeof DEPARTMENTS)[number])
  const all = roster
    .filter((r) => r.seated)
    .map((r) => ({ id: r.id, state: r.state as CoreState, d: bay(r.department) }))
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  let kept = all
  if (all.length > CORE_MAX) {
    const quiet = all.filter((l) => !ACTIVE(l.state))
    const room = Math.max(0, CORE_MAX - (all.length - quiet.length))
    const keepQuiet = new Set(quiet.slice(0, room).map((l) => l.id))
    kept = all.filter((l) => ACTIVE(l.state) || keepQuiet.has(l.id)).slice(0, CORE_MAX)
  }
  return kept.map(({ id, state }) => ({ id, state }))
}

function demoLights(project: Project): CoreLight[] {
  const robots = Object.values(project.agents).reduce((a, b) => a + b, 0)
  const working = project.status === 'idle' ? 0 : Math.min(10, robots)
  const waiting = project.status === 'needs-you' && working > 0 ? 1 : 0
  const out: CoreLight[] = []
  for (let i = 0; i < waiting; i++) out.push({ id: `demo-wait-${i}`, state: 'needs-you' })
  for (let i = 0; i < working - waiting; i++) out.push({ id: `demo-work-${i}`, state: 'running' })
  for (let i = 0; i < 2; i++) out.push({ id: `demo-rest-${i}`, state: 'idle' })
  return out.slice(0, CORE_MAX)
}

export function coreSummary(lights: CoreLight[]): { working: number; waiting: number; total: number } {
  return { working: lights.filter((l) => l.state === 'running').length, waiting: lights.filter((l) => l.state === 'needs-you').length, total: lights.length }
}

/**
 * How strongly the core's inner light glows, 0 to 1: dim when nothing works, brighter with more of the crew working,
 * breathing slowly (a little faster when something waits for you). Never jumps from one frame to the next.
 */
export function coreGlow(t: number, s: { working: number; waiting: number; total: number }): number {
  const time = Number.isFinite(t) ? t : 0
  const working = Number.isFinite(s.working) ? Math.max(0, s.working) : 0
  const waiting = Number.isFinite(s.waiting) ? Math.max(0, s.waiting) : 0
  const active = working + waiting
  if (active === 0) return 0.1
  const share = Math.min(1, active / Math.max(active, s.total || 0, 1))
  const base = 0.18 + 0.52 * share
  const breath = 0.5 + 0.5 * Math.sin(time * (waiting > 0 ? 1.6 : 0.9))
  return Math.min(1, base * (0.75 + 0.25 * breath))
}
