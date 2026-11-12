import { describe, expect, it } from 'vitest'
import { STROKES, resample, strokeProgress } from '../src/studioMath'
import { HUB, HUB_LAYOUT, STUDIO, studioToWorld } from '../src/hubLayout'

describe('STUDIO layout', () => {
  it('sits against the wall in the gap between Planning and Code Review', () => {
    const planning = HUB_LAYOUT.bays.find((b) => b.id === 'planning')!
    const review = HUB_LAYOUT.bays.find((b) => b.id === 'review')!
    const gap = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    expect(gap(STUDIO.angle, planning.angle)).toBeGreaterThan(0.45)
    expect(gap(STUDIO.angle, review.angle)).toBeGreaterThan(0.45)
    expect(STUDIO.radius + STUDIO.boardZ + 0.3).toBeLessThan(HUB.roomRadius)
  })

  it('turns to face the wall, with the board behind the designers', () => {
    expect(STUDIO.boardZ).toBeGreaterThan(Math.max(...STUDIO.designers.map((d) => d.position[2])))
    const [bx, , bz] = studioToWorld([0, 0, STUDIO.boardZ])
    expect(Math.hypot(bx, bz)).toBeGreaterThan(STUDIO.radius)
  })

  it('keeps every designer clear of every bay', () => {
    for (const d of STUDIO.designers) {
      const [x, , z] = studioToWorld(d.position)
      for (const bay of HUB_LAYOUT.bays) expect(Math.hypot(x - bay.position[0], z - bay.position[2])).toBeGreaterThan(3.2)
      expect(Math.hypot(x, z)).toBeLessThan(HUB.roomRadius - 1)
    }
  })

  it('has three designers: two drawing and one standing back to judge', () => {
    expect(STUDIO.designers.map((d) => d.clip)).toEqual(['draw', 'draw', 'think'])
  })
})

describe('strokes', () => {
  it('stay inside the board', () => {
    expect(STROKES.length).toBeGreaterThanOrEqual(3)
    for (const stroke of STROKES)
      for (const [x, y] of stroke) {
        expect(Math.abs(x)).toBeLessThanOrEqual(STUDIO.boardWidth / 2 - 0.2)
        expect(Math.abs(y)).toBeLessThanOrEqual(STUDIO.boardHeight / 2 - 0.1)
      }
  })

  it('progress draws up to 1, holds, then wipes back to 0, and repeats', () => {
    expect(strokeProgress(0, 0)).toBe(0)
    let max = 0
    for (let t = 0; t < 8; t += 0.1) {
      const p = strokeProgress(t, 0)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
      max = Math.max(max, p)
    }
    expect(max).toBe(1)
    expect(strokeProgress(8 + 1.7, 0)).toBeCloseTo(strokeProgress(1.7, 0), 6)
    expect(strokeProgress(2, 1)).not.toBeCloseTo(strokeProgress(2, 0), 3)
  })
})

describe('resample', () => {
  it('keeps the ends and spaces the points evenly enough to draw a solid line', () => {
    const line: [number, number][] = [[0, 0], [1, 0], [1, 1]]
    const r = resample(line, 0.05)
    expect(r[0]).toEqual([0, 0])
    expect(r[r.length - 1][0]).toBeCloseTo(1, 6)
    expect(r[r.length - 1][1]).toBeCloseTo(1, 6)
    for (let i = 1; i < r.length; i++) expect(Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1])).toBeLessThanOrEqual(0.0501)
    expect(r.length).toBeGreaterThan(35)
  })

  it('handles a single point and empty input', () => {
    expect(resample([[2, 3]], 0.05)).toEqual([[2, 3]])
    expect(resample([], 0.05)).toEqual([])
  })
})
