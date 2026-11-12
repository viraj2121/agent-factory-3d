import { bayPosition } from './hubLayout'
import type { Vec3 } from './hallLayout'
import type { Project } from './projects'
import type { RosterEntry } from './live/wire'

// The rest bunks: a ring of low bunks round the core deck, where the agents that are asleep (idle) or standing by (defined,
// never seen running) lie, all heads the same way round. The bays hold only the agents that work or wait for you. One bunk per agent,
// taken from the real roster; a demo project has no sleepers. The light strip on a bunk is the time the agent has been asleep
// (real time since its last activity), full after 8 hours. The bunks are in the free front arc between the glowing strips to
// the bays, so the camera that looks in from the front sees every sleeper.

export const BUNKS = {
  count: 6,
  /** Distance of the middle of a bunk from the core, in metres: outside the deck (3.2), inside the courier lane (5.1). */
  radius: 4.1,
  /** Length of a bunk (along the ring), and its width (across the ring). */
  length: 1.5,
  width: 0.9,
  /** Angle of the middle of the arc (0 points at the camera). */
  centre: 0,
  /** Angle between neighbouring bunks. */
  step: 0.5,
  /** Hours asleep that fill the light strip. */
  fullHours: 8,
}

export const REST = { angle: BUNKS.centre, radius: BUNKS.radius, position: bayPosition(BUNKS.centre, BUNKS.radius) }

export interface BunkSpec {
  index: number
  angle: number
  position: Vec3
  /** Turns the bunk so its length (local z, the head end at +z) runs along the ring, all heads the same way round. */
  rotationY: number
}

/** The bunks for `count` sleepers (at most the full ring): only as many as are needed, centred on the front, so there is never an empty bunk. */
export function bunkSpecs(count: number = BUNKS.count): BunkSpec[] {
  const n = Number.isFinite(count) ? Math.min(BUNKS.count, Math.max(0, Math.floor(count))) : 0
  return Array.from({ length: n }, (_, index) => {
    const angle = BUNKS.centre + (index - (n - 1) / 2) * BUNKS.step
    return { index, angle, position: bayPosition(angle, BUNKS.radius), rotationY: angle + Math.PI / 2 }
  })
}

/** 0 (just fell asleep, or never seen running) to 1 (asleep for eight hours or more). */
export function restFill(entry: Pick<RosterEntry, 'lastSeenAt'>, now: number): number {
  if (entry.lastSeenAt === null || !Number.isFinite(entry.lastSeenAt)) return 0
  const hours = (now - entry.lastSeenAt) / 3_600_000
  return hours > 0 ? Math.min(1, hours / BUNKS.fullHours) : 0
}

export interface BunkSlot {
  entry: RosterEntry
}

/** The agent in each bunk: those asleep (newest sleeper first), then those standing by (by name). Only occupied bunks are listed. */
export function restSlots(project: Project): { slots: BunkSlot[]; more: number; total: number } {
  const resting = (project.live?.roster ?? []).filter((r) => r.seated && (r.state === 'idle' || r.state === 'standby'))
  const sleepers = resting.filter((r) => r.state === 'idle').sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
  const standing = resting.filter((r) => r.state === 'standby').sort((a, b) => a.name.localeCompare(b.name))
  const all = [...sleepers, ...standing]
  const slots = all.slice(0, BUNKS.count).map((entry): BunkSlot => ({ entry }))
  return { slots, more: Math.max(0, all.length - BUNKS.count), total: all.length }
}

/** Steps of frost on a canopy: 0 is clear glass (just fell asleep or never seen running), the top step is eight hours or more. */
export const FROST_LEVELS = 4

export function frostLevel(fill: number): number {
  return Number.isFinite(fill) ? Math.round(Math.min(1, Math.max(0, fill)) * FROST_LEVELS) : 0
}
