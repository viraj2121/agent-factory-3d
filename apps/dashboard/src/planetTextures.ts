import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, type Texture } from 'three'
import { clamp01, fbm, hash2, mixRgb, type Rgb } from './surfaceNoise'
import type { PlanetKind } from './systemLayout'

// Surfaces of the planets and the star, drawn once on a canvas (continents, craters, lava cracks, dunes, gas bands,
// convection cells) and wrapped round a sphere by the shaders in systemMaterials.ts. They are decoration: nothing here
// comes from project data. The pictures hold plain sRGB numbers; the shaders decode them (like the sky photo).

const W = 512
const H = 256
const PER = 4

const GAS_BANDS: Partial<Record<PlanetKind, Rgb[]>> = {
  gasring: [[212, 170, 118], [168, 118, 78], [236, 206, 160], [190, 140, 96]],
  gas: [[150, 170, 200], [112, 134, 172], [190, 205, 225], [96, 112, 152]],
  ice: [[140, 210, 222], [124, 196, 212], [158, 222, 230]],
}

export const kindHasCities = (kind: PlanetKind): boolean => kind === 'ocean' || kind === 'desert' || kind === 'rocky'

type Pixel = [number, number, number, number?]

export function bake(w: number, h: number, fn: (u: number, v: number) => Pixel): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const d = g.createImageData(w, h)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const o = fn(px / w, py / h)
      const i = (py * w + px) * 4
      d.data[i] = o[0]
      d.data[i + 1] = o[1]
      d.data[i + 2] = o[2]
      d.data[i + 3] = o[3] === undefined ? 255 : o[3]
    }
  }
  g.putImageData(d, 0, 0)
  return c
}

export function toTexture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas)
  t.colorSpace = NoColorSpace
  t.wrapS = RepeatWrapping
  t.minFilter = LinearMipmapLinearFilter
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** The albedo of a kind of world. */
function surface(kind: PlanetKind, seed: number): HTMLCanvasElement {
  const P = PER
  const canvas = bake(W, H, (u, v) => {
    const x = u * P
    const y = v * P * 0.5
    const lat = Math.abs(v - 0.5) * 2
    if (kind === 'ocean') {
      const h = fbm(x, y, P, seed, 6)
      if (lat > 0.87 + (fbm(x * 3, y * 3, P * 3, seed + 9, 3) - 0.5) * 0.12) return [236, 243, 250]
      if (h < 0.5) return [...mixRgb([8, 30, 88], [34, 110, 168], (h - 0.3) / 0.2)] as Pixel
      const e = (h - 0.5) / 0.2
      const c = e < 0.2 ? mixRgb([196, 180, 120], [74, 118, 58], e / 0.2) : e < 0.6 ? mixRgb([74, 118, 58], [118, 96, 66], (e - 0.2) / 0.4) : mixRgb([118, 96, 66], [214, 214, 208], (e - 0.6) / 0.4)
      return [...c] as Pixel
    }
    if (kind === 'lava') {
      const n = fbm(x, y, P, seed, 5)
      const crack = lavaCrack(x, y, seed)
      const k = 0.6 + n * 0.9
      return [Math.min(255, 34 * k + crack * 255 + (n < 0.35 ? 70 : 0)), Math.min(255, 24 * k + crack * 120), Math.min(255, 22 * k + crack * 30)]
    }
    if (kind === 'desert') {
      const b = fbm(x, y * 3, P, seed, 5)
      const patch = fbm(x * 2, y * 2, P * 2, seed + 3, 4)
      let c = mixRgb([214, 174, 114], [176, 126, 78], b * 1.3 - 0.15)
      if (patch > 0.6) c = mixRgb(c, [118, 82, 56], (patch - 0.6) * 4)
      return [...c] as Pixel
    }
    if (kind === 'rocky') {
      const n = fbm(x * 2, y * 2, P * 2, seed, 5)
      const maria = fbm(x, y, P, seed + 4, 4)
      const k = 0.65 + n * 0.7
      let c: Rgb = [168 * k, 84 * k, 56 * k]
      if (maria > 0.56) c = mixRgb(c, [86, 52, 42], (maria - 0.56) * 5)
      if (lat > 0.91) c = [236, 236, 242]
      return [...c] as Pixel
    }
    if (kind === 'barren') {
      const n = fbm(x * 2, y * 2, P * 2, seed, 5)
      const maria = fbm(x, y, P, seed + 4, 4)
      let g = 95 + n * 95
      if (maria > 0.55) g *= 0.62
      return [g, g * 0.98, g * 0.94]
    }
    // gas and ice giants: bands bent by turbulence, with fine streaks
    const colors = GAS_BANDS[kind]!
    const d = fbm(x, y * 2, P, seed, 4)
    const b = Math.sin((v + (d - 0.5) * 0.2) * Math.PI * (kind === 'ice' ? 7 : 15)) * 0.5 + 0.5
    const f = b * (colors.length - 1)
    const i0 = Math.floor(f)
    const streak = fbm(x * 4, y * 24, P * 4, seed + 7, 3)
    let c = mixRgb(colors[i0], colors[Math.min(colors.length - 1, i0 + 1)], f - i0)
    const k = 0.82 + streak * 0.36
    c = [c[0] * k, c[1] * k, c[2] * k]
    if (kind === 'ice') c = mixRgb(c, [140, 210, 222], 0.5)
    return [...c] as Pixel
  })
  const craters = kind === 'barren' ? 70 : kind === 'rocky' ? 40 : kind === 'desert' ? 12 : 0
  if (craters) {
    const g = canvas.getContext('2d')!
    for (let k = 0; k < craters; k++) {
      const x = hash2(k, 1, seed * 13 + 5) * W
      const y = (0.1 + hash2(k, 2, seed * 13 + 5) * 0.8) * H
      const rad = 2 + Math.pow(hash2(k, 3, seed * 13 + 5), 2.2) * 12
      g.fillStyle = 'rgba(0,0,0,.26)'
      g.beginPath()
      g.arc(x, y, rad, 0, 7)
      g.fill()
      g.strokeStyle = 'rgba(255,255,255,.2)'
      g.lineWidth = 1.2
      g.beginPath()
      g.arc(x, y, rad, Math.PI * 0.9, Math.PI * 1.6)
      g.stroke()
    }
  }
  return canvas
}

/** How much of a lava crack is at this spot, 0..1. */
function lavaCrack(x: number, y: number, seed: number): number {
  const r2 = fbm(x * 2, y * 2, PER * 2, seed + 5, 4)
  const ridge = 1 - Math.abs(2 * r2 - 1)
  return clamp01((ridge - 0.88) / 0.12)
}

/** What glows at night: city lights on the worlds that have them, glowing cracks on the lava world. Black elsewhere. */
function lights(kind: PlanetKind, seed: number): HTMLCanvasElement {
  const canvas = bake(W, H, (u, v) => {
    if (kind !== 'lava') return [0, 0, 0]
    const c = lavaCrack(u * PER, v * PER * 0.5, seed)
    return [255 * c, 140 * c, 40 * c]
  })
  if (!kindHasCities(kind)) return canvas
  const g = canvas.getContext('2d')!
  for (let k = 0; k < 260; k++) {
    const u = hash2(k, 11, seed)
    const v = 0.14 + hash2(k, 12, seed) * 0.72
    if (kind === 'ocean') {
      const h = fbm(u * PER, v * PER * 0.5, PER, seed, 6)
      if (h < 0.52 || Math.abs(v - 0.5) * 2 > 0.8) continue
    } else if (hash2(k, 13, seed) < 0.35) continue
    // towns come in small clusters
    for (let q = 0; q < 4; q++) {
      const px = u * W + (hash2(k, 20 + q, seed) - 0.5) * 9
      const py = v * H + (hash2(k, 30 + q, seed) - 0.5) * 6
      g.fillStyle = `rgba(255,226,150,${0.5 + hash2(k, 40 + q, seed) * 0.5})`
      g.fillRect(px, py, 1.6, 1.6)
    }
  }
  return canvas
}

/** Clouds, white with an alpha, for the ocean world. */
function clouds(seed: number): HTMLCanvasElement {
  return bake(W, H, (u, v) => {
    const n = fbm(u * PER * 2, v * PER, PER * 2, seed + 50, 5)
    const belt = 0.5 + 0.5 * Math.cos((v - 0.5) * 6.2832 * 1.5)
    return [255, 255, 255, clamp01((n - 0.5 + belt * 0.06) * 4.2) * 215]
  })
}

export interface PlanetMaps {
  albedo: Texture
  lights: Texture
  clouds: Texture | null
}

const cache = new Map<string, PlanetMaps>()

/** The pictures for one kind of world, made once and kept. `seed` makes two worlds of one kind differ. */
export function planetMaps(kind: PlanetKind, seed = 11): PlanetMaps {
  const key = `${kind}:${seed}`
  let maps = cache.get(key)
  if (!maps) {
    maps = { albedo: toTexture(surface(kind, seed)), lights: toTexture(lights(kind, seed)), clouds: kind === 'ocean' ? toTexture(clouds(seed)) : null }
    cache.set(key, maps)
  }
  return maps
}
