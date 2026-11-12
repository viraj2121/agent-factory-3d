import { describe, expect, it } from 'vitest'
import { dustPoints, lampPositions } from '../src/hubDetails'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'

describe('lampPositions', () => {
  it('hangs one lamp above each bay, below the ceiling', () => {
    const lamps = lampPositions()
    expect(lamps).toHaveLength(HUB_LAYOUT.bays.length)
    HUB_LAYOUT.bays.forEach((bay, i) => {
      expect(Math.abs(lamps[i][0] - bay.position[0])).toBeLessThan(0.01)
      expect(Math.abs(lamps[i][2] - bay.position[2])).toBeLessThan(0.01)
      expect(lamps[i][1]).toBeGreaterThan(2.5)
      expect(lamps[i][1]).toBeLessThan(HUB.wallHeight)
    })
  })
})

describe('dustPoints', () => {
  it('is deterministic and stays inside the room', () => {
    const a = dustPoints(200)
    expect(dustPoints(200)).toEqual(a)
    expect(a).toHaveLength(200 * 3)
    for (let i = 0; i < 200; i++) {
      const x = a[i * 3]
      const y = a[i * 3 + 1]
      const z = a[i * 3 + 2]
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(HUB.roomRadius - 1)
      expect(y).toBeGreaterThanOrEqual(0.3)
      expect(y).toBeLessThanOrEqual(HUB.wallHeight - 0.5)
    }
  })

  it('returns nothing for a zero or negative count', () => {
    expect(dustPoints(0)).toHaveLength(0)
    expect(dustPoints(-5)).toHaveLength(0)
  })
})
