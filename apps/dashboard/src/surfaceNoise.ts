// Value noise that repeats in x, so a picture made from it wraps round a globe without a seam. Used to bake planet and
// star surfaces on a canvas (planetTextures.ts, starTexture.ts). Everything here is plain maths.

/** A repeatable number from 0 up to (not including) 1 for an integer lattice point and a seed. */
export function hash2(x: number, y: number, seed: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0..1. `per` is how many lattice cells wrap round in x (an integer). */
export function vnoise(x: number, y: number, per: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const wrap = (a: number) => ((a % per) + per) % per
  const a = hash2(wrap(xi), yi, seed)
  const b = hash2(wrap(xi + 1), yi, seed)
  const c = hash2(wrap(xi), yi + 1, seed)
  const d = hash2(wrap(xi + 1), yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Layers of noise at doubling detail, 0..1. `per` doubles with each layer so every one still wraps. */
export function fbm(x: number, y: number, per: number, seed: number, octaves = 5): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * freq, y * freq, per * freq, seed + o * 17)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
export type Rgb = [number, number, number]
export const mixRgb = (a: Rgb, b: Rgb, u: number): Rgb => {
  const k = clamp01(u)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}
