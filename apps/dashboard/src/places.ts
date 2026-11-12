import { REST } from './restBunks'
import { DEPARTMENTS } from './hallLayout'
import { HUB, HUB_LAYOUT, STUDIO } from './hubLayout'
import { launchPadWorld } from './launchpad'
import { LIBRARY } from './library'

// The places you can fly to in the hall, with where each stands on the floor. The mini-map draws them as dots; clicking
// one flies the camera there. The ids are what `hubCameraFor` takes (a bay opens its panel as well).

export type PlaceId = 'orb' | 'studio' | 'launchpad' | 'library' | 'cart' | 'rest' | (typeof DEPARTMENTS)[number]

export interface Place {
  id: PlaceId
  label: string
  /** Floor position in the hall, in metres. */
  x: number
  z: number
}

const LABELS: Record<PlaceId, string> = {
  orb: 'Core',
  planning: 'Planning',
  development: 'Development',
  review: 'Review & QA',
  rest: 'Rest docks',
  studio: 'Design studio',
  launchpad: 'Launch pad',
  library: 'Library',
  cart: 'Cart',
}

const [padX, , padZ] = launchPadWorld()

export const PLACES: Place[] = [
  { id: 'orb', label: LABELS.orb, x: 0, z: 0 },
  ...HUB_LAYOUT.bays.map((b): Place => ({ id: b.id, label: LABELS[b.id], x: b.position[0], z: b.position[2] })),
  { id: 'rest', label: LABELS.rest, x: REST.position[0], z: REST.position[2] },
  { id: 'studio', label: LABELS.studio, x: STUDIO.position[0], z: STUDIO.position[2] },
  { id: 'launchpad', label: LABELS.launchpad, x: padX, z: padZ },
  { id: 'library', label: LABELS.library, x: LIBRARY.radius * Math.sin(LIBRARY.angle), z: LIBRARY.radius * Math.cos(LIBRARY.angle) },
  { id: 'cart', label: LABELS.cart, x: 4.65, z: 4.65 },
]

/** The map is a 200 by 200 drawing; the hall's edge is a circle a little inside it. */
const MAP = 200
const MAP_RADIUS = 84

/** Where a floor position is on the map. What is nearer the camera (larger z) is lower, as on the screen. */
export function mapPoint(p: { x: number; z: number }): { x: number; y: number } {
  const k = MAP_RADIUS / HUB.roomRadius
  return { x: MAP / 2 + p.x * k, y: MAP / 2 + p.z * k }
}

/** The place nearest to a point on the map, when one is within reach (in map units). */
export function placeAt(x: number, y: number, reach = 12): Place | null {
  let best: Place | null = null
  let bestD = reach
  for (const p of PLACES) {
    const m = mapPoint(p)
    const d = Math.hypot(m.x - x, m.y - y)
    if (d <= bestD) {
      best = p
      bestD = d
    }
  }
  return best
}
