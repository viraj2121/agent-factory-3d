import type { Vec3 } from './hallLayout'

/**
 * The assembly cradle: a platform on the floor between two bays where two arms build a glowing model of
 * the project, one piece per finished task. Local coordinates: the platform sits at the origin, +x is
 * along the ring, +z points out toward the wall.
 */
export const CRADLE = { angle: 0, radius: 9.2, platformRadius: 1.6, pieces: 6, holoBase: 0.35 }

export const ARM = {
  upper: 1.9,
  fore: 1.9,
  baseA: [-1.9, 0.45, 0] as Vec3,
  baseB: [1.9, 0.45, 0] as Vec3,
}

/** Local cradle coordinates to world coordinates. */
export function cradleToWorld([x, y, z]: Vec3): Vec3 {
  const c = Math.cos(CRADLE.angle)
  const s = Math.sin(CRADLE.angle)
  return [CRADLE.radius * Math.sin(CRADLE.angle) + x * c + z * s, y, CRADLE.radius * Math.cos(CRADLE.angle) - x * s + z * c]
}

export interface ArmPose {
  /** Turn about the vertical axis, so local +x points at the target. */
  yaw: number
  /** Angle of the upper link above horizontal, in radians. */
  upper: number
  /** Angle of the forearm above horizontal, in radians. */
  fore: number
}

/** Two-link arm: where to point each link so the hand reaches `target` (as near as it can), elbow up. */
export function solveArm(base: Vec3, target: Vec3): ArmPose {
  const [L1, L2] = [ARM.upper, ARM.fore]
  const safe = target.every(Number.isFinite) ? target : ([base[0], base[1] + (L1 + L2) / 2, base[2]] as Vec3)
  const dx = safe[0] - base[0]
  const dy = safe[1] - base[1]
  const dz = safe[2] - base[2]
  const r = Math.hypot(dx, dz)
  const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, Math.hypot(r, dy)))
  const lift = Math.atan2(dy, r)
  const shoulder = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
  const elbow = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))))
  const upper = lift + shoulder
  return { yaw: Math.atan2(-dz, dx) || 0, upper, fore: upper - (Math.PI - elbow) }
}

export interface Piece {
  size: Vec3
  /** Height of the piece's centre above the floor. */
  y: number
}

const SIZES: Vec3[] = [[1.5, 0.3, 1.5], [1.1, 0.5, 1.1], [1.0, 0.5, 1.0], [0.8, 0.55, 0.8], [0.5, 0.35, 0.5], [0.3, 0.3, 0.3]]

const LAYOUT: Piece[] = (() => {
  let bottom = CRADLE.holoBase
  return SIZES.map((size) => {
    const piece = { size, y: bottom + size[1] / 2 }
    bottom += size[1]
    return piece
  })
})()

/** The pieces of the model from the bottom up, stacked with no gaps. */
export function pieceLayout(): Piece[] {
  return LAYOUT
}

/** Whole pieces built for a progress of 0 to 1. Anything else counts as nothing built. */
export function builtPieces(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.round(Math.min(1, Math.max(0, progress)) * CRADLE.pieces)
}

export interface CradleMoment {
  a: { hand: Vec3 }
  b: { hand: Vec3 }
  /** The piece being fitted, or null when the model is finished. */
  piece: { x: number; y: number; z: number } | null
  /** Which piece is being fitted. */
  index: number
  carrying: boolean
  welding: boolean
}

const TRAY: Vec3 = [-1.7, 0.75, 1.6]
const REST_A: Vec3 = [-1.2, 1.5, 0.7]
const REST_B: Vec3 = [1.2, 1.5, 0.7]
export const BUILD_SECONDS = 8

const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const ease = (k: number) => k * k * (3 - 2 * k)
const within = (u: number, from: number, to: number) => Math.min(1, Math.max(0, (u - from) / (to - from)))

/**
 * What both arms and the piece in hand are doing `t` seconds in. The piece that is next in line is
 * fetched from the tray, carried to its slot, set down and welded, then the loop repeats. With every
 * piece built both arms raise a salute. Demo motion: it never changes how many pieces are built.
 */
export function armTargets(t: number, built: number): CradleMoment {
  const time = Number.isFinite(t) ? t : 0
  if (built >= CRADLE.pieces) {
    const sway = Math.sin(time * 1.6) * 0.15
    return {
      a: { hand: [-1.0, 2.6 + sway, 0.3] },
      b: { hand: [1.0, 2.6 - sway, 0.3] },
      piece: null,
      index: CRADLE.pieces,
      carrying: false,
      welding: false,
    }
  }
  const index = Math.max(0, Math.floor(built))
  const slotY = pieceLayout()[index].y
  const above: Vec3 = [0, slotY + 0.5, 0]
  const seat: Vec3 = [0, slotY + 0.05, 0]
  const u = (((time % BUILD_SECONDS) + BUILD_SECONDS) % BUILD_SECONDS) / BUILD_SECONDS

  let a: Vec3
  let piece: Vec3
  let carrying = false
  if (u < 0.2) {
    a = mix(REST_A, TRAY, ease(within(u, 0, 0.2)))
    piece = [TRAY[0], 0.7, TRAY[2]]
  } else if (u < 0.3) {
    a = TRAY
    piece = [TRAY[0], 0.7, TRAY[2]]
  } else if (u < 0.65) {
    const k = ease(within(u, 0.3, 0.65))
    const lifted = mix(TRAY, above, k)
    a = [lifted[0], lifted[1] + 0.7 * Math.sin(Math.PI * k), lifted[2]]
    piece = a
    carrying = true
  } else if (u < 0.8) {
    a = mix(above, seat, ease(within(u, 0.65, 0.8)))
    piece = a
    carrying = true
  } else {
    a = mix(seat, REST_A, ease(within(u, 0.8, 1)))
    piece = [0, slotY, 0]
  }

  const weldAt: Vec3 = [0.35, slotY + 0.1, 0.45]
  const welding = u >= 0.7 && u < 0.95
  let b: Vec3
  if (u < 0.6) b = mix(REST_B, [REST_B[0], REST_B[1] + 0.2, REST_B[2]], 0.5 + 0.5 * Math.sin(time * 2))
  else if (u < 0.7) b = mix(REST_B, weldAt, ease(within(u, 0.6, 0.7)))
  else if (u < 0.95) b = [weldAt[0] + 0.05 * Math.sin(time * 18), weldAt[1] + 0.04 * Math.cos(time * 23), weldAt[2]]
  else b = mix(weldAt, REST_B, ease(within(u, 0.95, 1)))

  return { a: { hand: a }, b: { hand: b }, piece: { x: piece[0], y: piece[1], z: piece[2] }, index, carrying, welding }
}
