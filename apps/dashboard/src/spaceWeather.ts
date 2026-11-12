import { DOME } from './dome'
import type { ProjectStatus } from './projects'

// Space weather outside the shield dome, from the status of the project you look at (as the hall light does):
// calm drifting dust when idle, a meteor shower while agents work, an ion storm crawling over the dome when the
// project needs you. Decoration driven by status, never a measurement.

export interface SpaceWeather {
  /** 0 to 1: how much dust drifts past. */
  dust: number
  /** Meteors per second. */
  meteors: number
  /** 0 to 1: how often ion arcs crawl over the dome. */
  storm: number
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

export function spaceWeatherFor(status: ProjectStatus, activity: number): SpaceWeather {
  const a = Number.isFinite(activity) ? clamp01(activity) : 0.3
  if (status === 'needs-you') return { dust: 0.7, meteors: 0.2, storm: 0.6 + 0.3 * a }
  if (status === 'running') return { dust: 0.6, meteors: 0.35 + 1.1 * a, storm: 0 }
  return { dust: 0.55, meteors: 0.06, storm: 0 }
}

/** A number from 0 up to (not including) 1 that depends only on `n`. */
function hash01(n: number): number {
  let t = (Math.imul(Math.floor(n) | 0, 2654435761) ^ 0x9e3779b9) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const seeded = (seed: number) => {
  let i = Math.floor(seed) * 7919
  return () => hash01(i++)
}

/** Seconds a meteor takes to cross its path. */
export const METEOR_LIFE = 1.1
const METEOR_SLOT = 0.25

/**
 * The meteors in the sky at time `t` for `rate` meteors a second. Time is cut into quarter-second slots; a slot
 * starts a meteor with a chance of rate x slot length, at a moment of its own. Always the same for the same `t`.
 */
export function meteorsAt(t: number, rate: number): { id: number; progress: number }[] {
  if (!Number.isFinite(t) || t < 0 || !(rate > 0)) return []
  const out: { id: number; progress: number }[] = []
  const chance = Math.min(1, rate * METEOR_SLOT)
  const last = Math.floor(t / METEOR_SLOT)
  const first = Math.max(0, Math.floor((t - METEOR_LIFE) / METEOR_SLOT) - 1)
  for (let s = first; s <= last; s++) {
    if (hash01(s * 5 + 1) >= chance) continue
    const start = (s + hash01(s * 5 + 2)) * METEOR_SLOT
    const progress = (t - start) / METEOR_LIFE
    if (progress >= 0 && progress < 1) out.push({ id: s, progress })
  }
  return out
}

/** Where meteor `id` flies: a short slanting streak high in the sky, far beyond the islands. */
export function meteorPath(id: number): { from: [number, number, number]; to: [number, number, number] } {
  const rand = seeded(id * 13 + 7)
  const angle = rand() * Math.PI * 2
  const radius = 120 + rand() * 60
  const height = 45 + rand() * 50
  const from: [number, number, number] = [Math.sin(angle) * radius, height, Math.cos(angle) * radius]
  const side = angle + (rand() > 0.5 ? 1 : -1) * (0.15 + rand() * 0.2)
  const drop = 18 + rand() * 22
  const to: [number, number, number] = [Math.sin(side) * radius, Math.max(15, height - drop), Math.cos(side) * radius]
  return { from, to }
}

const ARC_SLOT = 2.5

/** An ion arc at time `t`: in a stormy slot a crackle of three quick flickers, under 0.5 s. `id` is -1 when none. */
export function arcAt(t: number, storm: number): { level: number; id: number } {
  const none = { level: 0, id: -1 }
  if (!Number.isFinite(t) || t < 0 || !(storm > 0)) return none
  const slot = Math.floor(t / ARC_SLOT)
  if (hash01(slot * 3 + 11) >= clamp01(storm) * 0.8) return none
  const dt = t - (slot * ARC_SLOT + 0.2 + hash01(slot * 3 + 12) * (ARC_SLOT - 0.8))
  if (dt < 0 || dt >= 0.45) return none
  const flicker = 0.55 + 0.45 * Math.abs(Math.sin(dt * 70))
  return { level: (1 - dt / 0.45) * flicker, id: slot }
}

/** The jagged path of arc `id` over the shield dome: a short crawl across its surface, a little above it. */
export function arcPath(id: number): [number, number, number][] {
  const rand = seeded(id * 17 + 3)
  let theta = rand() * Math.PI * 2
  let phi = 0.35 + rand() * 0.9 // from the top (0) toward the rim (pi/2)
  const points: [number, number, number][] = []
  const steps = 16
  const dTheta = (rand() - 0.5) * 0.12
  const dPhi = (rand() - 0.5) * 0.08
  for (let i = 0; i <= steps; i++) {
    const r = DOME.radius * (1.01 + rand() * 0.04)
    const p = Math.min(Math.PI / 2 - 0.02, Math.max(0.05, phi))
    points.push([Math.sin(p) * Math.cos(theta) * r, Math.cos(p) * r * DOME.squash, Math.sin(p) * Math.sin(theta) * r])
    theta += dTheta + (rand() - 0.5) * 0.06
    phi += dPhi + (rand() - 0.5) * 0.06
  }
  return points
}

/** Dust motes in a wide ring outside the dome: [x, y, z]. The same for the same `seed`. */
export function dustMotes(count: number, seed: number): [number, number, number][] {
  const rand = seeded(seed)
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2
    const radius = DOME.radius + 8 + rand() * 90
    return [Math.sin(angle) * radius, -20 + rand() * 50, Math.cos(angle) * radius]
  })
}
