import type { Vec3 } from './hallLayout'
import { SECTIONS } from './rocket'

// The launch pad stands in the ring slot beside the assembly cradle. The rocket on it is built section by section:
// a crane lowers each section into place and a robot welds its seam while the rocket turns on a turntable. How many
// sections are done follows the project's demo progress (the section being fitted loops, as the cradle's piece does,
// and never changes that count). Once the demo build is complete the rocket counts down, lifts off, and a new one is
// built again, quickly. Demo motion: it never claims anything was really shipped.

export const LAUNCH_PAD = { angle: -0.2 * Math.PI, radius: 8.6, padRadius: 1.9 }

export const launchPadWorld = (): Vec3 => [LAUNCH_PAD.radius * Math.sin(LAUNCH_PAD.angle), 0, LAUNCH_PAD.radius * Math.cos(LAUNCH_PAD.angle)]

/** The gantry tower, in the pad's own space (+z is outward, toward the parapet): behind the rocket, on the core side, so it never blocks the view from the hall. */
export const TOWER = { x: 0.85, z: -1.45, height: 5.4 }

/** Turns a point in the pad's own space into hall coordinates. */
export function padToWorld([x, y, z]: Vec3): Vec3 {
  const [px, , pz] = launchPadWorld()
  const c = Math.cos(LAUNCH_PAD.angle)
  const s = Math.sin(LAUNCH_PAD.angle)
  return [px + x * c + z * s, y, pz - x * s + z * c]
}

export interface WorkTiming {
  /** The crane lowers the section into place. */
  lower: number
  /** The turntable turns once while the robot welds the seam. */
  weld: number
  /** The fresh weld cools. */
  settle: number
  /** A pause before the next go. */
  gap: number
}

/** Fitting the section of a project that is still being built: the same go as a real build, looping on the same section with a short rest. */
export const BUILD: WorkTiming = { lower: 1.4, weld: 3, settle: 0.6, gap: 1 }
/** Building the next rocket after a launch: one section after another, the whole rocket in 30 seconds. */
export const REBUILD: WorkTiming = { lower: 1.4, weld: 3, settle: 0.6, gap: 0 }

const total = (w: WorkTiming) => w.lower + w.weld + w.settle + w.gap

const HOLD_END = 12
const COUNT_END = 16
const LIFT_END = 21
const GONE_END = 23
const REBUILD_SECTION = total(REBUILD)
/** Seconds for one full round: wait, count down, lift off, gone, build the next rocket. */
export const LAUNCH_CYCLE = GONE_END + SECTIONS * REBUILD_SECTION

export type RocketPhase = 'build' | 'hold' | 'countdown' | 'lift' | 'gone' | 'rebuild'
export type WorkPhase = 'lower' | 'weld' | 'settle' | 'raise'

export interface SectionWork {
  /** Which section is being fitted (0 is the nozzle skirt at the bottom). */
  index: number
  phase: WorkPhase
  /** How far through that phase it is, 0 to 1. */
  u: number
  /** How much of the seam ring is welded, 0 to 1. */
  weld: number
}

export interface RocketMoment {
  phase: RocketPhase
  /** Metres above the pad. */
  lift: number
  /** 0 to 1: how strong the engine flame is. */
  flame: number
  /** 0 to 1: how brightly the rocket glows. */
  glow: number
  /** How many of the three countdown lights are on. */
  lights: number
  /** How many sections are finished and solid. */
  solid: number
  /** The section being fitted and welded right now, if any. */
  work: SectionWork | null
  /** How far the turntable has turned, in radians (0 to a full turn while a seam is welded, otherwise 0). */
  yaw: number
}

const ease = (k: number) => k * k * (3 - 2 * k)

/** What the crane and the welder are doing `time` seconds into a go at section `index`. */
export function workAt(index: number, time: number, timing: WorkTiming): { work: SectionWork; yaw: number } {
  const length = total(timing)
  const u = ((time % length) + length) % length
  if (u < timing.lower) return { work: { index, phase: 'lower', u: u / timing.lower, weld: 0 }, yaw: 0 }
  const w = u - timing.lower
  if (w < timing.weld) {
    const k = w / timing.weld
    return { work: { index, phase: 'weld', u: k, weld: k }, yaw: ease(k) * Math.PI * 2 }
  }
  const s = w - timing.weld
  if (s < timing.settle) return { work: { index, phase: 'settle', u: s / timing.settle, weld: 1 }, yaw: 0 }
  // in the slow loop the crane lifts the section away again before the next go; building a real rocket never does
  return { work: { index, phase: 'raise', u: (s - timing.settle) / timing.gap, weld: 1 }, yaw: 0 }
}

/** The rocket at time `t` for a project whose demo build is `progress` (0 to 1) finished. */
export function rocketAt(progress: number, t: number): RocketMoment {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  const time = Number.isFinite(t) ? Math.max(0, t) : 0
  if (p < 1) {
    const solid = Math.min(SECTIONS - 1, Math.floor(p * SECTIONS))
    const { work, yaw } = workAt(solid, time, BUILD)
    return { phase: 'build', lift: 0, flame: 0, glow: 0.2 + 0.8 * p, lights: 0, solid, work, yaw }
  }
  const u = time % LAUNCH_CYCLE
  const done = { work: null, yaw: 0 }
  if (u < HOLD_END) return { phase: 'hold', lift: 0, flame: 0, glow: 1, lights: 0, solid: SECTIONS, ...done }
  if (u < COUNT_END) {
    const lights = Math.min(3, Math.floor(((u - HOLD_END) / (COUNT_END - HOLD_END)) * 4))
    return { phase: 'countdown', lift: 0, flame: u > COUNT_END - 0.6 ? 0.4 : 0, glow: 1, lights, solid: SECTIONS, ...done }
  }
  if (u < LIFT_END) {
    const s = u - COUNT_END
    return { phase: 'lift', lift: 2.4 * s * s, flame: 1, glow: 1, lights: 3, solid: SECTIONS, ...done }
  }
  if (u < GONE_END) return { phase: 'gone', lift: 0, flame: 0, glow: 0, lights: 0, solid: 0, ...done }
  const e = u - GONE_END
  const index = Math.min(SECTIONS - 1, Math.floor(e / REBUILD_SECTION))
  const { work, yaw } = workAt(index, e - index * REBUILD_SECTION, REBUILD)
  return { phase: 'rebuild', lift: 0, flame: 0, glow: 0.3 + 0.7 * (index / SECTIONS), lights: 0, solid: index, work, yaw }
}
