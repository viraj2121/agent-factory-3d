import type { Texture } from 'three'
import { bake, toTexture } from './planetTextures'
import { clamp01, fbm, hash2, mixRgb, type Rgb } from './surfaceNoise'

// The red dwarf's surface: boiling convection cells with dark lanes between them, big starspots and bright patches.
// Baked once on a canvas and wrapped round the star by the star shader. Decoration.

export interface StarLook {
  hot: Rgb
  cool: Rgb
  /** r,g,b of the shade used for lanes, spots and the limb. */
  dark: string
  cells: number
  spots: number
  bigSpots: number
}

export const RED_DWARF: StarLook = { hot: [255, 150, 100], cool: [200, 50, 20], dark: '110,15,0', cells: 104, spots: 8, bigSpots: 2 }

const W = 1024
const H = 512

export function starCanvas(look: StarLook): HTMLCanvasElement {
  const gx = look.cells
  const gy = gx / 2
  const cw = W / gx
  const ch = H / gy
  const canvas = bake(W, H, (u, v) => {
    const px = u * W
    const py = v * H
    const ci = Math.floor(px / cw)
    const cj = Math.floor(py / ch)
    let f1 = 1e9
    let f2 = 1e9
    let bv = 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const nj = cj + dj
        if (nj < 0 || nj >= gy) continue
        const ni = ci + di
        const wi = ((ni % gx) + gx) % gx
        const d = Math.hypot(px - (ni + hash2(wi, nj, 1)) * cw, py - (nj + hash2(wi, nj, 2)) * ch)
        if (d < f1) {
          f2 = f1
          f1 = d
          bv = hash2(wi, nj, 3)
        } else if (d < f2) f2 = d
      }
    }
    const ln = clamp01((f2 - f1) / (cw * 0.3))
    const lane = ln * ln * (3 - 2 * ln)
    const mott = fbm(u * 4, v * 2, 4, 77, 4)
    const fine = fbm(u * 64, v * 32, 64, 91, 3)
    const k = (0.8 + 0.2 * bv) * (0.5 + 0.5 * lane) * (0.8 + 0.4 * mott) * (0.9 + 0.2 * fine)
    const c = mixRgb(look.cool, look.hot, clamp01(bv * 0.8 + mott * 0.4 - 0.15))
    return [c[0] * k, c[1] * k, c[2] * k]
  })
  const g = canvas.getContext('2d')!
  for (let n = 0; n < look.spots; n++) {
    const x = hash2(n, 1, 900) * W
    const y = (0.3 + hash2(n, 2, 900) * 0.4) * H
    const rad = (n < look.bigSpots ? 34 : 10) + hash2(n, 3, 900) * 14
    g.fillStyle = `rgba(${look.dark},.5)`
    g.beginPath()
    g.ellipse(x, y, rad * 1.9, rad * 1.5, 0, 0, 7)
    g.fill()
    g.fillStyle = `rgba(${look.dark},.4)`
    g.beginPath()
    g.ellipse(x, y, rad * 1.4, rad * 1.1, 0, 0, 7)
    g.fill()
    g.fillStyle = 'rgba(28,10,6,.82)'
    g.beginPath()
    g.ellipse(x, y, rad, rad * 0.75, 0, 0, 7)
    g.fill()
    for (let q = 0; q < 5; q++) {
      g.fillStyle = 'rgba(255,245,210,.18)'
      g.beginPath()
      g.ellipse(x + (hash2(n, 10 + q, 900) - 0.5) * rad * 5, y + (hash2(n, 20 + q, 900) - 0.5) * rad * 3, 3 + hash2(n, 30 + q, 900) * 6, 2 + hash2(n, 40 + q, 900) * 3, 0, 0, 7)
      g.fill()
    }
  }
  return canvas
}

let cached: Texture | null = null
export function starTexture(): Texture {
  if (!cached) cached = toTexture(starCanvas(RED_DWARF))
  return cached
}
