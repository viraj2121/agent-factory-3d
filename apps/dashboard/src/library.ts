import type { Vec3 } from './hallLayout'

// The library: three shelf units against the wall in the gap between Planning and Development, with a glowing
// archive core in front. One shelf box lights up for every share of the demo build that is finished, and a
// scanning arm slides along a rail in front of the shelves filing boxes. Demo motion from demo progress.

export const LIBRARY = { angle: (144 * Math.PI) / 180, radius: 12.1, units: 3, unitStep: 0.2, shelves: 4, perShelf: 8 }
export const LIBRARY_SLOTS = LIBRARY.units * LIBRARY.shelves * LIBRARY.perShelf
/** The arm is the cradle's arm model drawn at this fraction of its size. */
export const LIBRARY_ARM_SCALE = 0.55
/** Height of the arm's shoulder: it stands on a column on its rail. */
export const ARM_BASE_Y = 0.9

/** Heights of the shelf boards, and the room each crate on them takes along the shelf. */
export const SHELF_Y = [0.5, 1.05, 1.6, 2.15]
export const BOX_STEP = 0.27
/** Distance from the shelf unit's middle line forward to the rail the arm slides on, toward the core. */
const RAIL_FRONT = 0.95

/** The middle of shelf unit `k` (0 to 2) on the floor, and the angle it stands at. */
export function unitCentre(k: number): { x: number; z: number; angle: number } {
  const angle = LIBRARY.angle + (k - 1) * LIBRARY.unitStep
  return { x: LIBRARY.radius * Math.sin(angle), z: LIBRARY.radius * Math.cos(angle), angle }
}

/** A spot at `along` metres from a unit's middle (along the shelf), `out` metres toward the core, and height `y`. */
export function inUnit(k: number, along: number, out: number, y: number): Vec3 {
  const { angle } = unitCentre(k)
  const r = LIBRARY.radius - out
  // the shelf runs across the radius direction; "along" moves sideways round the ring
  const a = angle + along / LIBRARY.radius
  return [r * Math.sin(a), y, r * Math.cos(a)]
}

/** Where crate `i` sits: the bottom shelf fills first, across all three units, then the next shelf up, and so on. */
export function slotWorld(i: number): Vec3 {
  const perShelf = LIBRARY.units * LIBRARY.perShelf
  const shelf = Math.floor(i / perShelf)
  const within = i % perShelf
  const unit = Math.floor(within / LIBRARY.perShelf)
  const col = within % LIBRARY.perShelf
  return inUnit(unit, (col - (LIBRARY.perShelf - 1) / 2) * BOX_STEP, 0.22, SHELF_Y[shelf] + 0.17)
}

/** How many boxes are lit for a demo build `progress` (0 to 1) finished. */
export function filledSlots(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.round(Math.min(1, Math.max(0, progress)) * LIBRARY_SLOTS)
}

const hash01 = (n: number) => {
  let t = (Math.imul(Math.floor(n) | 0, 2654435761) ^ 0x7f4a7c15) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const FILE_SECONDS = 5

export interface LibraryArmMoment {
  /** The rail position the arm stands at. */
  base: Vec3
  /** Where its wrist goes. */
  hand: Vec3
  /** The shelf spot it is working on. */
  slot: number
  /** 0 to 1: how far it leans in to put a box on the shelf. */
  insert: number
  /** True while it is still bringing the box to the shelf. */
  carrying: boolean
}

/** The scanning arm at time `t`: goes to a spot on the shelves, leans in to file a box, and moves on to the next. */
export function libraryArm(t: number): LibraryArmMoment {
  const time = Number.isFinite(t) && t > 0 ? t : 0
  const cycle = Math.floor(time / FILE_SECONDS)
  const u = (time % FILE_SECONDS) / FILE_SECONDS
  const slot = Math.floor(hash01(cycle * 7 + 3) * LIBRARY_SLOTS) % LIBRARY_SLOTS
  const previous = Math.floor(hash01((cycle - 1) * 7 + 3) * LIBRARY_SLOTS) % LIBRARY_SLOTS
  const [sx, sy, sz] = slotWorld(slot)
  const [px] = slotWorld(cycle > 0 ? previous : slot)
  // glide along the rail during the first third, then work
  const glide = u < 0.33 ? (u / 0.33) * (u / 0.33) * (3 - 2 * (u / 0.33)) : 1
  const railAt = (x: number, z: number): Vec3 => {
    const a = Math.atan2(x, z)
    const r = LIBRARY.radius - RAIL_FRONT
    return [r * Math.sin(a), ARM_BASE_Y, r * Math.cos(a)]
  }
  const from = railAt(px, slotWorld(cycle > 0 ? previous : slot)[2])
  const to = railAt(sx, sz)
  const base: Vec3 = [from[0] + (to[0] - from[0]) * glide, ARM_BASE_Y, from[2] + (to[2] - from[2]) * glide]
  const insert = u < 0.5 ? 0 : Math.sin(((u - 0.5) / 0.5) * Math.PI)
  // the wrist comes in toward the shelf as it files, and hangs back a little otherwise
  const back = RAIL_FRONT - 0.3
  const dx = sx - to[0]
  const dz = sz - to[2]
  const len = Math.hypot(dx, dz) || 1
  const lean = back - 0.25 * insert
  const hand: Vec3 = [base[0] + (dx / len) * lean, sy, base[2] + (dz / len) * lean]
  return { base, hand, slot, insert, carrying: u < 0.7 }
}

/**
 * Where the two robots that tend the library stand, and which way they face (a yaw angle). The first stands in front
 * of the catalogue desk, to the left; the second is at the shelves, to the right.
 */
export function tenderSpots(): { x: number; z: number; heading: number }[] {
  return [
    { offset: -0.28, out: 2.6 },
    { offset: 0.14, out: 1.6 },
  ].map(({ offset, out }) => {
    const a = LIBRARY.angle + offset
    const r = LIBRARY.radius - out
    const x = r * Math.sin(a)
    const z = r * Math.cos(a)
    return { x, z, heading: Math.atan2(x, z) }
  })
}

/** Where the catalogue desk stands: just beyond the first tender, between it and the shelves, facing the core. */
export function deskSpot(): { x: number; z: number; angle: number } {
  const angle = LIBRARY.angle - 0.28
  const r = LIBRARY.radius - 1.95
  return { x: r * Math.sin(angle), z: r * Math.cos(angle), angle }
}

/** The middle of the dais the archive core stands on. */
export function daisCentre(): { x: number; z: number } {
  const r = LIBRARY.radius - 2.5
  return { x: r * Math.sin(LIBRARY.angle), z: r * Math.cos(LIBRARY.angle) }
}
