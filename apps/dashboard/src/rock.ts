import { LatheGeometry, Vector2, type BufferGeometry } from 'three'

const RINGS = 12
const SEGMENTS = 28

/** Smooth wobble that depends only on position, so the seam of the lathe stays closed. */
const wobble = (x: number, y: number, z: number, seed: number) =>
  0.5 * Math.sin(x * 0.9 + seed) * Math.sin(z * 1.1 + seed * 1.7) + 0.3 * Math.sin(y * 1.3 + x * 0.5 + seed * 0.6) + 0.2 * Math.sin(z * 2.3 - y * 0.8 + seed * 2.1)

/**
 * A floating island's rock: flat on top at y = 0 with the given radius, tapering to a rough point
 * `depth` below. Lumpy but the same every time for the same seed.
 */
export function rockGeometry(radius: number, depth: number, seed: number): BufferGeometry {
  const profile: Vector2[] = []
  for (let i = RINGS; i >= 0; i--) {
    const t = i / RINGS
    // wide shoulder near the top, narrowing faster toward the tip
    profile.push(new Vector2(radius * Math.pow(1 - t, 0.8) * (1 - 0.12 * Math.sin(t * Math.PI * 3)), -depth * Math.pow(t, 1.15)))
  }
  profile.push(new Vector2(0, 0)) // close the flat top
  const g = new LatheGeometry(profile, SEGMENTS)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const depthT = Math.min(1, -y / depth)
    if (depthT < 0.02) continue // keep the top edge crisp
    const k = 1 + 0.16 * wobble(x, y, z, seed) * Math.min(1, depthT * 3)
    pos.setXYZ(i, x * k, y + wobble(z, x, y, seed + 5) * depth * 0.04 * Math.min(1, depthT * 3), z * k)
  }
  g.computeVertexNormals()
  return g
}
