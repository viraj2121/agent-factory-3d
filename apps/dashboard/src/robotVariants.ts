import type { Department } from './hallLayout'

export const ROBOT_VARIANTS = ['planner', 'developer', 'reviewer', 'tester', 'integrator'] as const
export type RobotVariant = (typeof ROBOT_VARIANTS)[number]

/** Every clip inside each robot-<variant>.glb. */
export const ROBOT_CLIPS = ['idle', 'idle2', 'typing', 'wave', 'think', 'inspect', 'test', 'assemble'] as const
export type RobotClip = (typeof ROBOT_CLIPS)[number]

/** Shapes that can sit at any desk in any bay, picked at random per seat. Not tied to a department. */
export const BAY_VARIANTS = ['terminal', 'gauge', 'plug', 'cassette', 'fishbowl'] as const

/** Extra robot shapes for the design studio, the orb, the cart and the bays. Not tied to a department. */
export const EXTRA_VARIANTS = ['designer', 'keeper', 'driver', 'pocket', 'crawler', ...BAY_VARIANTS] as const
export type ExtraVariant = (typeof EXTRA_VARIANTS)[number]
export type AnyVariant = RobotVariant | ExtraVariant

/** Extra clips found in the extra robots' files, on top of ROBOT_CLIPS. */
export const EXTRA_CLIPS = ['draw', 'walk', 'polish', 'gauge', 'drive'] as const
export type ExtraClip = (typeof EXTRA_CLIPS)[number]

/** Short performances in every robot file: click gestures, a stretch for idle breaks and a high five for meetings. */
export const GESTURE_CLIPS = ['dance', 'dance2', 'cheer', 'bow', 'shrug', 'flex', 'salute', 'spin', 'stretch', 'highfive'] as const
export type GestureClip = (typeof GESTURE_CLIPS)[number]
export type AnyClip = RobotClip | ExtraClip | GestureClip

const VARIANT_BY_DEPARTMENT: Record<Department, RobotVariant> = {
  planning: 'planner',
  development: 'developer',
  review: 'reviewer',
}

const PRIMARY_CLIP: Record<RobotVariant, RobotClip> = {
  planner: 'think',
  developer: 'typing',
  reviewer: 'inspect',
  tester: 'test',
  integrator: 'assemble',
}

export const variantFor = (department: Department): RobotVariant => VARIANT_BY_DEPARTMENT[department]

/** The job at one seat of a department. Two stations are merged: Review & QA (its middle seat tests, the others read code) and Development & Integration (its middle seat assembles and ships, the others write code). */
export const seatJob = (department: Department, seat: number): RobotVariant =>
  department === 'review' && seat % 2 === 1 ? 'tester' : department === 'development' && seat % 2 === 1 ? 'integrator' : VARIANT_BY_DEPARTMENT[department]
export const primaryClip = (variant: RobotVariant): RobotClip => PRIMARY_CLIP[variant]

/** The clip for one seat: the department's work clip, except an occasional robot taking a breather. */
export const seatClip = (variant: RobotVariant, seed: number): RobotClip => (seed % 7 === 3 ? 'idle2' : PRIMARY_CLIP[variant])

// Body tints and eye colours. Pure green, red and blue are left out: they are reserved for status.
const TINTS = ['#f1ece4', '#f5d9a8', '#d9ccf2', '#f2c8dc', '#f7cdb4', '#cfe4ee', '#f6ecb5']
const EYES = ['#22d3ee', '#ffb347', '#b48cff', '#ff6ec7', '#ffe14d']

export interface RobotLook {
  tint: string
  eye: string
  scale: number
  /** Animation speed multiplier. */
  speed: number
  /** Where in the loop to start, 0 up to but not including 1. */
  offset: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A stable per-robot look and timing, so no two robots move or look the same. */
export function robotLook(seed: number): RobotLook {
  const next = mulberry32(seed * 7919 + 13)
  // Walk the lists with the seed first so neighbouring seeds always differ.
  const tint = TINTS[(seed * 3 + 1) % TINTS.length]
  const eye = EYES[(seed * 2 + Math.floor(next() * 2)) % EYES.length]
  return {
    tint,
    eye,
    scale: 0.92 + next() * 0.16,
    speed: 0.85 + next() * 0.3,
    offset: next() * 0.999,
  }
}
