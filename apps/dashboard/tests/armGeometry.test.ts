import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { buildClawParts, buildFinger, buildLink, buildTorch } from '../src/armGeometry'

const finite = (g: BufferGeometry) => Array.from(g.getAttribute('position').array).every(Number.isFinite)
const extent = (g: BufferGeometry, axis: 'x' | 'y' | 'z') => {
  g.computeBoundingBox()
  return [g.boundingBox!.min[axis], g.boundingBox!.max[axis]] as const
}

describe('buildLink', () => {
  for (const kind of ['upper', 'fore'] as const) {
    const { lit, glow } = buildLink(kind, 1.9)

    it(`${kind}: has colour on every vertex and no bad numbers`, () => {
      for (const g of [lit, glow]) {
        expect(finite(g)).toBe(true)
        expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
      }
    })

    it(`${kind}: runs along +x for about its length, and is a real model`, () => {
      const [lo, hi] = extent(lit, 'x')
      expect(lo).toBeGreaterThan(-0.45)
      expect(hi).toBeGreaterThan(1.9 * 0.9)
      expect(hi).toBeLessThan(1.9 + 0.35)
      expect(lit.getAttribute('position').count).toBeGreaterThan(800)
      expect(glow.getAttribute('position').count).toBeGreaterThan(50)
    })

    it(`${kind}: stays slim, so it does not look like a block`, () => {
      const [y0, y1] = extent(lit, 'y')
      const [z0, z1] = extent(lit, 'z')
      expect(y1 - y0).toBeLessThan(0.9)
      expect(z1 - z0).toBeLessThan(0.9)
    })
  }

  it('is the same every time', () => {
    const a = Array.from(buildLink('upper', 1.9).lit.getAttribute('position').array)
    const b = Array.from(buildLink('upper', 1.9).lit.getAttribute('position').array)
    expect(a).toEqual(b)
  })
})

describe('claw and torch', () => {
  it('the claw has a palm and a finger that point along +x', () => {
    const { palm } = buildClawParts()
    const finger = buildFinger()
    for (const g of [palm, finger]) {
      expect(finite(g)).toBe(true)
      expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
    }
    expect(extent(finger, 'x')[1]).toBeGreaterThan(0.2)
    expect(extent(palm, 'x')[1]).toBeLessThan(0.3)
  })

  it('the torch reaches further than the palm and has a glowing tip', () => {
    const { body, tip } = buildTorch()
    expect(extent(body, 'x')[1]).toBeGreaterThan(0.3)
    expect(finite(tip)).toBe(true)
  })
})
