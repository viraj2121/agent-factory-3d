import { describe, expect, it } from 'vitest'
import { fbm, hash2, vnoise } from '../src/surfaceNoise'

describe('hash2', () => {
  it('is the same for the same inputs and spreads over 0..1', () => {
    expect(hash2(3, 7, 1)).toBe(hash2(3, 7, 1))
    const v = Array.from({ length: 400 }, (_, i) => hash2(i, i * 3 + 1, 5))
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...v)).toBeLessThan(1)
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    expect(mean).toBeGreaterThan(0.4)
    expect(mean).toBeLessThan(0.6)
  })

  it('differs when the seed differs', () => {
    expect(hash2(3, 7, 1)).not.toBe(hash2(3, 7, 2))
  })
})

describe('vnoise and fbm', () => {
  it('stay inside 0..1', () => {
    for (let i = 0; i < 300; i++) {
      const x = (i * 0.37) % 4
      const y = (i * 0.91) % 2
      const n = vnoise(x, y, 4, 9)
      const f = fbm(x, y, 4, 9, 5)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })

  it('wraps in x: the picture meets itself at its left and right edges (no seam on a globe)', () => {
    const per = 4
    for (const y of [0.2, 0.9, 1.7]) {
      expect(fbm(0, y, per, 3, 5)).toBeCloseTo(fbm(per, y, per, 3, 5), 9)
      expect(fbm(0.4, y, per, 3, 5)).toBeCloseTo(fbm(per + 0.4, y, per, 3, 5), 9)
    }
  })

  it('is smooth: a tiny step changes the value a tiny amount', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.071
      expect(Math.abs(fbm(x, 0.5, 4, 2, 5) - fbm(x + 0.001, 0.5, 4, 2, 5))).toBeLessThan(0.01)
    }
  })

  it('differs between seeds, so two planets do not share a surface', () => {
    expect(fbm(1.3, 0.7, 4, 11, 5)).not.toBeCloseTo(fbm(1.3, 0.7, 4, 12, 5), 3)
  })
})
