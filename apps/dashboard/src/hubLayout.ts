import { DEPARTMENTS, type Department, type Vec3 } from './hallLayout'

// Where everything goes in the round hall. Coordinates are three.js space (y up, +z toward the
// default camera). `angle` 0 points at +z and increases toward +x. Blender conversion:
// to_blender(x, y, z) = (x, -z, y).

export const HUB = {
  roomRadius: 15,
  wallHeight: 9,
  deckRadius: 3.2,
  deckHeight: 0.4,
  oculusRadius: 2.6,
  coreCenter: [0, 1.8, 0] as Vec3,
  coreRadius: 0.9,
}

export interface BaySpec {
  id: Department
  label: string
  angle: number
  radius: number
  position: Vec3
  /** Turns the bay so its front (+z) faces the core. */
  rotationY: number
  /** Robot seats, relative to the bay origin. */
  seats: Vec3[]
}

export function bayPosition(angle: number, radius: number): Vec3 {
  return [radius * Math.sin(angle), 0, radius * Math.cos(angle)]
}

const SEATS: Vec3[] = [
  [-1.1, 0, -0.12],
  [0, 0, 0],
  [1.1, 0, -0.12],
]

const BAY_RADIUS = 9
const ANGLES: Record<Department, number> = {
  planning: Math.PI,
  development: 0.6 * Math.PI,
  review: -0.6 * Math.PI,
}
const LABELS: Record<Department, string> = {
  planning: 'PLANNING',
  development: 'DEVELOPMENT & INTEGRATION',
  review: 'CODE REVIEW & QA',
}

export const HUB_LAYOUT: { bays: BaySpec[] } = {
  bays: DEPARTMENTS.map((id) => ({
    id,
    label: LABELS[id],
    angle: ANGLES[id],
    radius: BAY_RADIUS,
    position: bayPosition(ANGLES[id], BAY_RADIUS),
    rotationY: ANGLES[id] + Math.PI,
    seats: SEATS,
  })),
}

// ---- design studio --------------------------------------------------------------------------
// An open drawing area against the wall, in the gap between Planning and Code Review. Its local
// +z points out toward the wall, so the designers face the board.

export interface StudioDesigner {
  /** Position in studio-local space. */
  position: Vec3
  clip: 'draw' | 'think'
}

const STUDIO_ANGLE = -0.8 * Math.PI
const STUDIO_RADIUS = 12.2

export const STUDIO = {
  angle: STUDIO_ANGLE,
  radius: STUDIO_RADIUS,
  position: bayPosition(STUDIO_ANGLE, STUDIO_RADIUS),
  rotationY: STUDIO_ANGLE,
  /** Distance from the studio origin to the board, along local z. */
  boardZ: 1.15,
  boardWidth: 4.6,
  boardHeight: 1.7,
  boardCenterY: 1.2,
  designers: [
    { position: [-1.4, 0, 0.7], clip: 'draw' },
    { position: [0.2, 0, 0.7], clip: 'draw' },
    { position: [1.6, 0, -0.9], clip: 'think' },
  ] as StudioDesigner[],
}

/** Turns a studio-local point into a world point. */
export function studioToWorld(local: Vec3): Vec3 {
  const c = Math.cos(STUDIO.rotationY)
  const s = Math.sin(STUDIO.rotationY)
  return [STUDIO.position[0] + local[0] * c + local[2] * s, local[1], STUDIO.position[2] - local[0] * s + local[2] * c]
}
