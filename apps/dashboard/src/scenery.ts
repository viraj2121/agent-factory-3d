// How much decoration the hall shows. Only the robots, their markers and the status colours are real; everything else is
// scenery. Calm (the default) takes away the crowd of walkers and the busy show, and keeps a few friendly things (the cart and two couriers) and the quiet props.
// Real only takes all of it away.

export type Scenery = 'full' | 'calm' | 'real'
export const SCENERY_LEVELS: Scenery[] = ['full', 'calm', 'real']

export interface SceneryParts {
  /** The two couriers that carry boxes about (kept in calm: friendly and few). */
  couriers: boolean
  /** The other robots that walk about: the orb keepers and the crawlers. They look like agents but are not. */
  wanderers: boolean
  /** Steam and sparks from the vents. */
  steam: boolean
  /** The helper machines, with the cart. */
  machines: boolean
  /** Floating dust. */
  dust: boolean
  /** Pulses running along the floor. */
  pulses: boolean
  /** Holograms and scrolling screens. */
  holograms: boolean
  /** Floor streaks and glow pools. */
  decals: boolean
  /** The conveyor belt (it only runs while Development works). */
  belt: boolean
  /** The welding robot at the rocket. */
  weldShow: boolean
  /** The inspection drone circling the rocket. */
  drone: boolean
  /** The two robots that tend the library. */
  tenders: boolean
  /** Weather outside the dome (still switched off by its own setting and by Lite). */
  weather: boolean
}

const FULL: SceneryParts = { couriers: true, wanderers: true, steam: true, machines: true, dust: true, pulses: true, holograms: true, decals: true, belt: true, weldShow: true, drone: true, tenders: true, weather: true }
const CALM: SceneryParts = { ...FULL, wanderers: false, steam: false, dust: false, drone: false, tenders: false }
const REAL: SceneryParts = { couriers: false, wanderers: false, steam: false, machines: false, dust: false, pulses: false, holograms: false, decals: false, belt: false, weldShow: false, drone: false, tenders: false, weather: false }

export function sceneryFor(level: Scenery): SceneryParts {
  return level === 'full' ? FULL : level === 'real' ? REAL : CALM
}
