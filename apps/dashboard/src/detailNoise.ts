/** A whole-number hash of a lattice point, as 0 up to 1. Same inputs, same output. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise on a lattice that repeats every `px` by `py` cells, at position (u, v) in 0 up to 1. */
function valueNoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px
  const y = v * py
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const at = (i: number, j: number) => hash(((i % px) + px) % px, ((j % py) + py) % py, seed)
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
  return top * (1 - fy) + bottom * fy
}

/** Several layers of noise, each twice as fine and half as strong. Stays inside 0 up to 1. */
function fbm(u: number, v: number, px: number, py: number, octaves: number, seed: number): number {
  let sum = 0
  let weight = 0.5
  let total = 0
  for (let o = 0; o < octaves; o++) {
    sum += weight * valueNoise(u, v, px << o, py << o, seed + o * 31)
    total += weight
    weight /= 2
  }
  return sum / total
}

const stretch = (n: number, gain: number) => Math.min(1, Math.max(0, (n - 0.5) * gain + 0.5))

/**
 * A square RGBA image that tiles in both directions, used to add wear to surfaces:
 * red is fine grain, green is long streaks (scratches and rust runs), blue is large soft blotches.
 */
export function detailNoiseData(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const i = (y * size + x) * 4
      out[i] = Math.round(stretch(fbm(u, v, 8, 8, 4, seed), 2.4) * 255)
      out[i + 1] = Math.round(stretch(fbm(u, v, 3, 48, 3, seed + 100), 2.8) * 255)
      out[i + 2] = Math.round(stretch(fbm(u, v, 3, 3, 3, seed + 200), 2.6) * 255)
      out[i + 3] = 255
    }
  }
  return out
}
