import { GESTURE_CLIPS, type AnyVariant, type GestureClip } from './robotVariants'

export { GESTURE_CLIPS, type GestureClip }

/** The gestures a click can start. Stretch and high five are kept for idle breaks and meetings. */
export const CLICK_GESTURES = ['dance', 'dance2', 'cheer', 'bow', 'shrug', 'flex', 'salute', 'spin'] as const
export type ClickGesture = (typeof CLICK_GESTURES)[number]

/** One loop of every gesture clip lasts this long, in seconds (48 frames at 24 per second). */
export const GESTURE_SECONDS = 2

/** How likely each gesture is for a robot with no taste of its own. The spin is a rare treat. */
const BASE: Record<ClickGesture, number> = { dance: 3, dance2: 3, cheer: 3, bow: 2, shrug: 2, flex: 2, salute: 2, spin: 0.5 }

/** What each shape likes to do: its favourites are picked more often. */
const TASTE: Partial<Record<AnyVariant, Partial<Record<ClickGesture, number>>>> = {
  planner: { bow: 3, shrug: 2 },
  developer: { dance: 3, dance2: 2 },
  reviewer: { salute: 3, shrug: 2 },
  tester: { cheer: 3, flex: 1.5 },
  integrator: { flex: 3, cheer: 2 },
  designer: { dance2: 3, bow: 2 },
  keeper: { bow: 3, salute: 2 },
  driver: { salute: 3, cheer: 2 },
  pocket: { spin: 6, cheer: 2 },
  crawler: { dance: 2, shrug: 2 },
  terminal: { shrug: 3, dance2: 2 },
  gauge: { salute: 3, flex: 2 },
  plug: { flex: 3, cheer: 2 },
  cassette: { dance: 4, dance2: 3 },
  fishbowl: { bow: 3, shrug: 2, spin: 3 },
}

/** Picks a gesture for a click: weighted by the robot's taste, never the one it just did. `rand` gives a number from 0 up to 1. */
export function pickGesture(variant: AnyVariant, last: GestureClip | null, rand: () => number): ClickGesture {
  const taste = TASTE[variant] ?? {}
  const weights = CLICK_GESTURES.map((g) => (g === last ? 0 : BASE[g] * (taste[g] ?? 1)))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.min(0.999999, Math.max(0, rand())) * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r < 0) return CLICK_GESTURES[i]
  }
  return CLICK_GESTURES.find((g) => g !== last) ?? CLICK_GESTURES[0]
}

/** How many times a gesture's loop is played: a bow or a salute once, the rest one to three times. */
const LOOPS: Record<GestureClip, [number, number]> = {
  dance: [2, 3], dance2: [2, 3], cheer: [1, 2], bow: [1, 1], shrug: [1, 2], flex: [1, 2], salute: [1, 1], spin: [1, 1], stretch: [1, 1], highfive: [1, 1],
}

export function gestureLoops(clip: GestureClip, rand: () => number): number {
  const [min, max] = LOOPS[clip]
  return Math.min(max, min + Math.floor(Math.min(0.999999, Math.max(0, rand())) * (max - min + 1)))
}

export const gestureSeconds = (_clip: GestureClip, loops: number): number => Math.max(1, loops) * GESTURE_SECONDS

/** Clicks closer together than this, in seconds, count as one. */
export const CLICK_GAP = 0.35
const FLURRY_WINDOW = 3
const FLURRY_CLICKS = 4

export const tooSoon = (lastAt: number | null, now: number): boolean => lastAt !== null && now - lastAt < CLICK_GAP

/** Remembers recent click times. The fourth click inside three seconds is "excited" and the count starts over. */
export function registerClick(recent: number[], now: number): { recent: number[]; excited: boolean } {
  const kept = [...recent.filter((t) => now - t <= FLURRY_WINDOW), now]
  return kept.length >= FLURRY_CLICKS ? { recent: [], excited: true } : { recent: kept, excited: false }
}

const EMOTE: Record<GestureClip, string> = {
  dance: '♪', dance2: '♫', cheer: '!', bow: '♥', shrug: '?', flex: '💪', salute: '★', spin: '✦', stretch: '~', highfive: '🙌',
}

/** A tiny symbol that floats up while a gesture plays. */
export const emoteFor = (clip: GestureClip): string => EMOTE[clip]

/** Small breaks for robots at their desks. */
export const BREAK_CLIPS = ['stretch', 'idle2', 'wave'] as const
const BREAK_PERIOD = 26
const BREAK_SECONDS: Record<(typeof BREAK_CLIPS)[number], number> = { stretch: 2, idle2: 4, wave: 4 }

function hash01(a: number, b: number): number {
  let t = (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 0x9e3779b9, 40503)) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * The break a seated robot is taking at time `t`, if any: once in every 26 seconds or so, at a moment of its own,
 * it stretches, looks around or waves for a few seconds. Always the same for a given robot and time.
 */
export function breakAt(seed: number, t: number): { clip: (typeof BREAK_CLIPS)[number]; start: number; end: number } | null {
  if (!Number.isFinite(t) || t < 0) return null
  const k = Math.floor(t / BREAK_PERIOD)
  const clip = BREAK_CLIPS[Math.floor(hash01(seed, k * 3 + 1) * BREAK_CLIPS.length)]
  const length = BREAK_SECONDS[clip]
  const start = k * BREAK_PERIOD + 4 + hash01(seed, k * 3 + 2) * (BREAK_PERIOD - 8 - length)
  return t >= start && t < start + length ? { clip, start, end: start + length } : null
}
