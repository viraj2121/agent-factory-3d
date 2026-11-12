import { describe, expect, it } from 'vitest'
import { CYCLE_SECONDS, KEEPER_RADIUS, STOP_ANGLES, keeperState } from '../src/keepers'
import { HUB } from '../src/hubLayout'

describe('keeperState', () => {
  it('stays on the deck loop at deck height at every moment', () => {
    for (let t = 0; t < CYCLE_SECONDS * 2; t += 0.7)
      for (const i of [0, 1]) {
        const [x, y, z] = keeperState(t, i).position
        expect(Math.hypot(x, z)).toBeCloseTo(KEEPER_RADIUS, 4)
        expect(y).toBeCloseTo(HUB.deckHeight, 6)
      }
    expect(KEEPER_RADIUS).toBeLessThan(HUB.deckRadius)
  })

  it('works at each stop facing the core, then walks between them', () => {
    const atStop = keeperState(1, 0)
    expect(['gauge', 'polish', 'assemble']).toContain(atStop.clip)
    const [x, , z] = atStop.position
    expect(Math.atan2(x, z)).toBeCloseTo(STOP_ANGLES[0], 4)
    const facing = [Math.sin(atStop.yaw), Math.cos(atStop.yaw)]
    expect(facing[0] * x + facing[1] * z).toBeLessThan(0)
    const clips = new Set<string>()
    for (let t = 0; t < CYCLE_SECONDS; t += 0.5) clips.add(keeperState(t, 0).clip)
    expect(clips.has('walk')).toBe(true)
    expect(clips.size).toBeGreaterThanOrEqual(4)
  })

  it('repeats every cycle and keeps the two keepers apart', () => {
    expect(keeperState(3.3 + CYCLE_SECONDS, 0).position[0]).toBeCloseTo(keeperState(3.3, 0).position[0], 6)
    const a = keeperState(5, 0).position
    const b = keeperState(5, 1).position
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(1)
  })
})
