import { REST } from './restBunks'
import type { Department, Vec3 } from './hallLayout'
import { HUB, HUB_LAYOUT, STUDIO } from './hubLayout'
import { launchPadWorld } from './launchpad'
import { LIBRARY } from './library'
import { BELTS, beltPoint } from './belts'

// Sound follows what you are looking at. The point the camera looks at decides which element of the hall has your
// attention (the core, one bay, the launch pad, the library, the belt, the studio, or none of them: the
// whole hall), and only that element's sounds play; the others fade out. A robot you click always plays its tune.

export type FocusId = 'overview' | 'core' | 'studio' | 'pad' | 'library' | 'belt' | 'rest' | `bay:${Department}`

/** What a sound belongs to. A sound is heard only while its category is in the current focus's mix. */
export type Category = 'hum' | 'typing' | 'tubes' | 'cradle' | 'pad' | 'library' | 'belt' | 'weather'

export const CATEGORIES: Category[] = ['hum', 'typing', 'tubes', 'cradle', 'pad', 'library', 'belt', 'weather']

export interface FocusArea {
  id: FocusId
  x: number
  z: number
  /** How close the look point must be, on the floor, for this element to have the focus. */
  radius: number
}

const belt = beltPoint(BELTS[0], 0.5)
const [padX, , padZ] = launchPadWorld()

export const FOCUS_AREAS: FocusArea[] = [
  { id: 'core', x: HUB.coreCenter[0], z: HUB.coreCenter[2], radius: 4.2 },
  ...HUB_LAYOUT.bays.map((b): FocusArea => ({ id: `bay:${b.id}`, x: b.position[0], z: b.position[2], radius: 3.2 })),
  { id: 'studio', x: STUDIO.position[0], z: STUDIO.position[2], radius: 3.8 },
  { id: 'pad', x: padX, z: padZ, radius: 3.4 },
  { id: 'library', x: LIBRARY.radius * Math.sin(LIBRARY.angle), z: LIBRARY.radius * Math.cos(LIBRARY.angle), radius: 4.6 },
  { id: 'rest', x: REST.position[0], z: REST.position[2], radius: 2 },
  { id: 'belt', x: belt.x, z: belt.z, radius: 2.8 },
]

/** The height of the plane the camera's gaze is followed to: about the height of the robots. */
const LOOK_PLANE = 1.2

/** Where the camera is looking, on the plane about a robot's height; null when it looks level or up (the sky) or very far off. The page prefers the point the camera orbits when it can read it, and uses this when it cannot. */
export function lookPoint(camera: Vec3, forward: Vec3): Vec3 | null {
  if (!camera.every(Number.isFinite) || !forward.every(Number.isFinite) || forward[1] > -0.04) return null
  const t = (LOOK_PLANE - camera[1]) / forward[1]
  if (!(t > 0) || t > 400) return null
  return [camera[0] + forward[0] * t, LOOK_PLANE, camera[2] + forward[2] * t]
}

/** The element a point on the floor belongs to: the one it is closest to, compared with its size; the whole hall when none. */
export function focusAt(point: Vec3 | null): FocusId {
  if (!point) return 'overview'
  let best: FocusId = 'overview'
  let bestRatio = 1
  for (const a of FOCUS_AREAS) {
    const ratio = Math.hypot(point[0] - a.x, point[2] - a.z) / a.radius
    if (ratio <= bestRatio) {
      best = a.id
      bestRatio = ratio
    }
  }
  return best
}

const MIX: Record<string, Partial<Record<Category, number>>> = {
  overview: { hum: 0.55, tubes: 1, weather: 1 },
  core: { hum: 1 },
  studio: {},
  pad: { pad: 1 },
  library: { library: 1 },
  belt: { belt: 1 },
}

/** How loud each kind of sound should be while `focus` has the attention (0 is muted). */
export function mixFor(focus: FocusId): Record<Category, number> {
  const wanted = focus.startsWith('bay:') ? { typing: 1 } : (MIX[focus] ?? {})
  return Object.fromEntries(CATEGORIES.map((c) => [c, (wanted as Partial<Record<Category, number>>)[c] ?? 0])) as Record<Category, number>
}

/** Moves a level toward its target, taking about `seconds` to get most of the way, so sounds fade instead of cutting. */
export function fadeToward(current: number, target: number, dt: number, seconds = 0.35): number {
  if (!Number.isFinite(dt) || dt <= 0) return current
  return current + (target - current) * (1 - Math.exp(-dt / seconds))
}

const NAMES: Record<string, string> = {
  overview: 'the whole hall',
  core: 'the core',
  studio: 'the studio',
  pad: 'the launch pad',
  library: 'the library',
  belt: 'the belt',
  'bay:planning': 'Planning',
  'bay:development': 'Development',
  'bay:review': 'Review & QA',
  rest: 'the rest docks',
}

/** A plain name for what has the focus, for the button's hint. */
export const focusName = (focus: FocusId): string => NAMES[focus] ?? 'the hall'
