import { Matrix3, Vector3 } from 'three'
import type { Vec3 } from './hallLayout'
import type { QualitySettings } from './quality'
import { skyCamera } from './skyLayout'

// Where the big things of space sit, all placed for the sky view: the Milky Way photo turned so the band crosses
// the view at a slant with the galactic centre low on the left, the sun in the upper right, a ringed gas giant in
// the lower left. Everything is far behind the islands and only decoration.

/** The real sky: NASA Goddard SVS "Deep Star Maps 2020" (galactic), turned into JPGs. See public/textures/CREDITS.md. */
export const SKY_PHOTO = { large: '/textures/milkyway-4k.jpg', small: '/textures/milkyway-2k.jpg' }

export const skyPhotoFor = (q: QualitySettings): string => (q.skyPhoto === 'large' ? SKY_PHOTO.large : SKY_PHOTO.small)

/** The sky view camera's forward, right and up directions. */
function skyViewBasis() {
  const v = skyCamera()
  const f = new Vector3(...v.target).sub(new Vector3(...v.position)).normalize()
  const r = new Vector3().crossVectors(f, new Vector3(0, 1, 0)).normalize()
  const u = new Vector3().crossVectors(r, f).normalize()
  return { f, r, u, position: new Vector3(...v.position) }
}

/** A direction that lands `right` and `up` across the sky view (in units of the view's half-height tangent). */
function viewDirection(right: number, up: number): Vector3 {
  const { f, r, u } = skyViewBasis()
  return f.clone().addScaledVector(r, right).addScaledVector(u, up).normalize()
}

let mapToWorld: Matrix3 | null = null
/**
 * Turns a direction in the photo's own space (galactic centre at -z, band in the y = 0 plane) into the scene's space.
 * The shader uses the transpose to look up the photo for a world direction.
 */
export function skyMapToWorld(): Matrix3 {
  if (mapToWorld) return mapToWorld.clone()
  const { r, u } = skyViewBasis()
  const core = viewDirection(-0.3, -0.12)
  // the band runs through the core, rising to the right at about 30 degrees on screen
  const slant = r.clone().multiplyScalar(Math.cos(Math.PI / 6)).addScaledVector(u, Math.sin(Math.PI / 6))
  const band = slant.addScaledVector(core, -slant.dot(core)).normalize()
  const pole = new Vector3().crossVectors(band, core).normalize()
  const back = core.clone().negate()
  mapToWorld = new Matrix3().set(band.x, pole.x, back.x, band.y, pole.y, back.y, band.z, pole.z, back.z)
  return mapToWorld.clone()
}

const SUN_DIR = viewDirection(0.5, 0.25)
/** The sun: a direction (it is far away), and how far its glow is drawn. */
export const SUN = {
  direction: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z] as Vec3,
  distance: 300,
}

const GIANT_DISTANCE = 440
const giantAt = skyViewBasis().position.addScaledVector(viewDirection(-0.42, -0.2), GIANT_DISTANCE)
/** The ringed gas giant: centre, radius, ring from `ringInner` to `ringOuter` times the radius, ring tilt. */
export const GIANT = {
  position: [giantAt.x, giantAt.y, giantAt.z] as Vec3,
  radius: 88,
  ringInner: 1.35,
  ringOuter: 2.2,
  tilt: [0.9, 0.2, 0.35] as Vec3,
}

export interface FlareGhost {
  /** Position on screen, -1..1 across and up. */
  x: number
  y: number
  /** Size as a share of the screen height. */
  size: number
  opacity: number
  color: string
}

const GHOSTS: { along: number; size: number; opacity: number; color: string }[] = [
  { along: 0.55, size: 0.05, opacity: 0.22, color: '#ffd9a8' },
  { along: 0.15, size: 0.025, opacity: 0.3, color: '#9fd4ff' },
  { along: -0.35, size: 0.11, opacity: 0.1, color: '#c3a6ff' },
  { along: -0.8, size: 0.04, opacity: 0.18, color: '#ffb980' },
]

/**
 * Lens flare ghosts for the sun at `sun` (its position on screen; z above 1 means behind the camera). They sit on the
 * line from the sun through the middle of the screen and fade as the sun nears the edge.
 */
export function flareGhosts(sun: { x: number; y: number; z: number }): FlareGhost[] {
  const edge = Math.max(Math.abs(sun.x), Math.abs(sun.y))
  const seen = sun.z >= 1 ? 0 : Math.min(1, Math.max(0, (1.15 - edge) / 0.35))
  return GHOSTS.map((g) => ({ x: sun.x * g.along, y: sun.y * g.along, size: g.size, opacity: g.opacity * seen, color: g.color }))
}
