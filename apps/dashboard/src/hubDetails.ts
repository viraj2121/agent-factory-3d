import type { Vec3 } from './hallLayout'
import { HUB, HUB_LAYOUT } from './hubLayout'

/** Height of each hanging lamp above the floor, in metres. */
export const LAMP_HEIGHT = 5.2

/** One lamp straight above the centre of each bay. */
export function lampPositions(): Vec3[] {
  return HUB_LAYOUT.bays.map((b) => [b.position[0], LAMP_HEIGHT, b.position[2]])
}

/** Deterministic dust positions (x, y, z flattened) inside the room, for floating motes. */
export function dustPoints(count: number): Float32Array {
  const n = Math.max(0, Math.floor(count))
  const out = new Float32Array(n * 3)
  let a = 12345
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rand()) * (HUB.roomRadius - 1.5)
    const ang = rand() * Math.PI * 2
    out[i * 3] = r * Math.cos(ang)
    out[i * 3 + 1] = 0.5 + rand() * (HUB.wallHeight - 1.5)
    out[i * 3 + 2] = r * Math.sin(ang)
  }
  return out
}
