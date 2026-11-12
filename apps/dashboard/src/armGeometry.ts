import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { joinGeometries } from './mergeStatic'

// Colours are painted into each part's vertices, so a whole link is one draw call (two with its glow).
const COPPER = '#c0721a'
const STEEL = '#d6d9de'
const DARK = '#1b1f24'
const AMBER = '#e0a21a'
const GLOW_AMBER = '#ffb347'
const GLOW_CYAN = '#22d3ee'

function tint(g: BufferGeometry, hex: string): BufferGeometry {
  const c = new Color(hex)
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}

const at = (g: BufferGeometry, x: number, y = 0, z = 0) => g.translate(x, y, z)

/** A cylinder lying along +x from `x` to `x + len`, `r0` wide at the start and `r1` at the end. */
const cylX = (r0: number, r1: number, len: number, x: number, hex: string, y = 0, z = 0, seg = 20) =>
  at(tint(new CylinderGeometry(r1, r0, len, seg, 1).rotateZ(-Math.PI / 2), hex), x + len / 2, y, z)

/** A ring around the x axis. */
const ringX = (r: number, tube: number, x: number, hex: string) => at(tint(new TorusGeometry(r, tube, 10, 20).rotateY(Math.PI / 2), hex), x)

/** A ring facing along the z axis (a joint cap). */
const ringZ = (r: number, tube: number, x: number, z: number, hex: string) => at(tint(new TorusGeometry(r, tube, 10, 24), hex), x, 0, z)

/** A cylinder whose axis runs along z (a joint housing). */
const housing = (r: number, len: number, x: number, hex: string) => at(tint(new CylinderGeometry(r, r, len, 24).rotateX(Math.PI / 2), hex), x)

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: string) => at(tint(new BoxGeometry(w, h, d), hex), x, y, z)

function join(parts: BufferGeometry[]): BufferGeometry {
  const g = joinGeometries(parts)
  if (!g) throw new Error('arm part could not be built')
  return g
}

/**
 * One arm link along +x from the joint at the origin: a tapered body with ribs, a hydraulic piston along
 * the top, a cable along the underside, warning bands and a joint housing. `lit` takes normal lighting,
 * `glow` is the ring lights, to be drawn unlit.
 */
export function buildLink(kind: 'upper' | 'fore', length: number): { lit: BufferGeometry; glow: BufferGeometry } {
  const upper = kind === 'upper'
  const base = upper ? 0.14 : 0.1
  const tip = upper ? 0.105 : 0.07
  const body = upper ? COPPER : STEEL
  const radiusAt = (x: number) => base + (tip - base) * (x / length)
  const lit: BufferGeometry[] = [
    cylX(base, tip, length - 0.2, 0.1, body),
    housing(upper ? 0.24 : 0.17, upper ? 0.34 : 0.26, 0, upper ? STEEL : DARK),
    box(0.12, upper ? 0.3 : 0.22, 0.04, length - 0.05, 0, 0.16, DARK),
    box(0.12, upper ? 0.3 : 0.22, 0.04, length - 0.05, 0, -0.16, DARK),
    cylX(0.02, 0.02, length - 0.3, 0.15, DARK, -radiusAt(length / 2) - 0.02, 0.06, 8),
    cylX(0.016, 0.016, length - 0.35, 0.18, DARK, -radiusAt(length / 2) - 0.04, -0.05, 8),
  ]
  for (const f of upper ? [0.25, 0.45, 0.65, 0.85] : [0.3, 0.55, 0.8]) lit.push(ringX(radiusAt(f * length) + 0.018, 0.026, f * length, DARK))
  const bandAt = upper ? [0.22] : [0.5, 0.62, 0.74]
  for (const x of bandAt) lit.push(cylX(radiusAt(x) + 0.012, radiusAt(x) + 0.012, 0.1, x - 0.05, AMBER))
  // hydraulic piston: a sleeve over the first part and a rod running on to a bracket
  const lift = radiusAt(length * 0.4) + 0.08
  const sleeve = length * (upper ? 0.42 : 0.38)
  lit.push(cylX(0.055, 0.055, sleeve, 0.18, DARK, lift, 0, 14))
  lit.push(cylX(0.03, 0.03, length * 0.4, 0.18 + sleeve * 0.7, STEEL, lift, 0, 10))
  lit.push(box(0.1, 0.05, 0.1, 0.18, lift - 0.06, 0, STEEL))
  lit.push(box(0.1, 0.05, 0.1, length * 0.7, lift - 0.06, 0, STEEL))
  if (!upper) lit.push(at(tint(new SphereGeometry(0.09, 14, 10), DARK), length))
  const glow: BufferGeometry[] = [
    ringZ(upper ? 0.2 : 0.14, 0.022, 0, upper ? 0.19 : 0.14, upper ? GLOW_AMBER : GLOW_CYAN),
    ringZ(upper ? 0.2 : 0.14, 0.022, 0, upper ? -0.19 : -0.14, upper ? GLOW_AMBER : GLOW_CYAN),
  ]
  if (upper) glow.push(ringZ(0.13, 0.02, length, 0.19, GLOW_CYAN), ringZ(0.13, 0.02, length, -0.19, GLOW_CYAN))
  else glow.push(ringX(0.075, 0.016, length - 0.02, GLOW_AMBER))
  return { lit: join(lit), glow: join(glow) }
}

/** The palm of the claw, with its collar and a small status light. Fingers are separate so they can open and close. */
export function buildClawParts(): { palm: BufferGeometry } {
  return {
    palm: join([
      box(0.16, 0.13, 0.24, 0.1, 0, 0, DARK),
      cylX(0.07, 0.07, 0.06, 0, STEEL),
      box(0.04, 0.03, 0.05, 0.12, 0.08, 0, GLOW_CYAN),
      cylX(0.03, 0.03, 0.08, 0.14, STEEL, -0.04, 0.1, 8),
      cylX(0.03, 0.03, 0.08, 0.14, STEEL, -0.04, -0.1, 8),
    ]),
  }
}

/** One finger of the claw, hinged at the origin and pointing along +x. */
export function buildFinger(): BufferGeometry {
  const tip = tint(new BoxGeometry(0.1, 0.045, 0.04).rotateZ(0.35), DARK)
  return join([box(0.2, 0.05, 0.04, 0.1, 0, 0, STEEL), at(tip, 0.24, -0.02), box(0.05, 0.06, 0.05, 0.02, 0, 0, DARK)])
}

/** A welding torch for the second arm: a barrel on the palm with a nozzle, and a separate glowing tip. */
export function buildTorch(): { body: BufferGeometry; tip: BufferGeometry } {
  return {
    body: join([
      box(0.16, 0.13, 0.2, 0.08, 0, 0, DARK),
      cylX(0.05, 0.05, 0.06, 0, STEEL),
      cylX(0.04, 0.028, 0.3, 0.16, DARK, 0, 0, 14),
      cylX(0.05, 0.05, 0.05, 0.22, STEEL, 0, 0, 14),
      cylX(0.03, 0.02, 0.06, 0.4, STEEL, 0, 0, 12),
    ]),
    tip: at(tint(new SphereGeometry(0.035, 10, 8), GLOW_AMBER), 0.47),
  }
}
