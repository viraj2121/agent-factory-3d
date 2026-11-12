import { BAY_VARIANTS, ROBOT_VARIANTS, type AnyVariant } from './robotVariants'

/** Every shape that can sit at a desk: the five department robots and the five bay shapes. Any bay can have any of them. */
export const SEAT_SHAPES: AnyVariant[] = [...ROBOT_VARIANTS, ...BAY_VARIANTS]

export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
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

/**
 * The shapes for the seats of one bay: a stable random pick for each project and bay, never the same shape
 * twice in a bay. Reloading shows the same crowd; another project shows a different one.
 */
export function seatShapes(projectId: string, bayIndex: number, seats: number): AnyVariant[] {
  const next = mulberry32(hashString(`${projectId}#${bayIndex}`))
  const pool = [...SEAT_SHAPES]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const swap = pool[i]
    pool[i] = pool[j]
    pool[j] = swap
  }
  return pool.slice(0, Math.max(0, Math.min(pool.length, Math.floor(seats))))
}
