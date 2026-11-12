import { describe, expect, it } from 'vitest'
import { scuffData } from '../src/scuff'

describe('scuffData', () => {
  it('is a square RGBA image, the same every time', () => {
    const a = scuffData(64)
    expect(a).toHaveLength(64 * 64 * 4)
    expect(scuffData(64)).toEqual(a)
  })

  it('is opaque and mostly bright, so it only roughens the surface a little', () => {
    const a = scuffData(64)
    let sum = 0
    for (let i = 0; i < a.length; i += 4) {
      expect(a[i + 3]).toBe(255)
      expect(a[i]).toBeGreaterThanOrEqual(100)
      sum += a[i]
    }
    const mean = sum / (a.length / 4)
    expect(mean).toBeGreaterThan(170)
    expect(mean).toBeLessThan(245)
  })

  it('has visible variation, not a flat colour', () => {
    const a = scuffData(64)
    const values = new Set<number>()
    for (let i = 0; i < a.length; i += 4) values.add(a[i])
    expect(values.size).toBeGreaterThan(20)
  })
})
