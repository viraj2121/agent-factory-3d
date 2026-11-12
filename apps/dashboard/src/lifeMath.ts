import type { Vec3 } from './hallLayout'
import { HUB } from './hubLayout'

// Small pure helpers that give the hub its life: changing screens, hologram bars, floor pulses,
// a rolling cart and a drone, steam, ceiling cable runs, wall posters, light pools and floor streaks.

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Rows of text-like bars as RGBA bytes, for scrolling across screens. Brighter means lit. */
export function screenStripes(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  const rand = rng(4242)
  const rowLen: number[] = []
  for (let g = 0; g < Math.ceil(size / 4); g++) rowLen.push((0.2 + 0.8 * rand()) * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const lit = y % 4 < 2 && x < rowLen[Math.floor(y / 4)]
      const v = lit ? 235 : 55
      const i = (y * size + x) * 4
      out[i] = out[i + 1] = out[i + 2] = v
      out[i + 3] = 255
    }
  return out
}

/** Heights of a small bar chart, each between 0.15 and 1, drifting over time. */
export function barHeights(t: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * (0.7 + 0.23 * i) + i * 1.9)))
}

/** A ring that grows from 0.2 to 1 of its full size while fading out, repeating every `period` s. */
export function ringPulse(t: number, period: number): { scale: number; opacity: number } {
  const phase = (((t % period) + period) % period) / period
  return { scale: 0.2 + 0.8 * phase, opacity: 0.65 * (1 - phase) ** 2 }
}

/** The middle of the cart's lane. Its path sways this far either side, in metres. */
export const CART_RADIUS = 6.6
export const CART_SWAY = 0.12
const CART_SPEED = 0.12

/** How far round the hub the cart has gone: a steady drift plus a slow surge, so it speeds up and slows down but never stops or reverses. */
const cartAngle = (t: number) => t * CART_SPEED + 0.3 * Math.sin(t * 0.31)

/** The cart circles the hub between the deck and the bays, speeding up and slowing down and swaying a little. */
export function cartPosition(t: number): Vec3 {
  const a = cartAngle(t)
  const r = CART_RADIUS + CART_SWAY * Math.sin(t * 0.5)
  return [r * Math.sin(a), 0, r * Math.cos(a)]
}

/** Yaw (about y) that points the cart's front (+z) along its path. */
export function cartHeading(t: number): number {
  const [x1, , z1] = cartPosition(t - 0.01)
  const [x2, , z2] = cartPosition(t + 0.01)
  return Math.atan2(x2 - x1, z2 - z1)
}

/** The drone wanders round the core in a looping figure that never quite repeats, rising and dipping as it goes. */
export function dronePosition(t: number): Vec3 {
  return [
    4.4 * Math.sin(0.21 * t) + 1.2 * Math.sin(0.57 * t + 1),
    3.6 + 0.3 * Math.sin(1.7 * t) + 0.25 * Math.sin(0.43 * t),
    4.4 * Math.cos(0.17 * t + 0.5) + 1.1 * Math.cos(0.43 * t),
  ]
}

/** Puff positions (x, y, z flattened) rising from a vent and drifting a little. */
export function steamPoints(t: number, count: number, origin: Vec3): Float32Array {
  const n = Math.max(0, Math.floor(count))
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const phase = (((t * 0.35 + i / n) % 1) + 1) % 1
    const ang = i * 2.4
    const r = 0.1 + phase * 0.7 * (0.5 + 0.5 * Math.sin(i * 1.7))
    out[i * 3] = origin[0] + r * Math.cos(ang)
    out[i * 3 + 1] = origin[1] + phase * 2.8
    out[i * 3 + 2] = origin[2] + r * Math.sin(ang)
  }
  return out
}

/** A soft round fade as RGBA: white, with opacity highest in the middle and zero at the edge. */
export function radialData(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  const half = size / 2
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half
      const a = Math.max(0, 1 - d) ** 1.5
      const i = (y * size + x) * 4
      out[i] = out[i + 1] = out[i + 2] = 255
      out[i + 3] = Math.round(a * 255)
    }
  return out
}

export interface StreakSpot {
  x: number
  z: number
  rot: number
  length: number
  width: number
}

/** Deterministic rust and scuff streak positions on the floor. */
export function streakSpots(count: number): StreakSpot[] {
  const rand = rng(31337)
  return Array.from({ length: Math.max(0, count) }, () => {
    const r = 5.2 + rand() * 8.3
    const a = rand() * Math.PI * 2
    return { x: r * Math.cos(a), z: r * Math.sin(a), rot: rand() * Math.PI, length: 1.2 + rand() * 1.4, width: 0.15 + rand() * 0.25 }
  })
}

export const ROOM_RADIUS = HUB.roomRadius
