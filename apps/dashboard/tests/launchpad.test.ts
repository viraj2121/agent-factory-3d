import { describe, expect, it } from 'vitest'
import { HUB_LAYOUT } from '../src/hubLayout'
import { CRADLE, cradleToWorld } from '../src/cradle'
import { SECTIONS } from '../src/rocket'
import { BUILD, LAUNCH_CYCLE, LAUNCH_PAD, REBUILD, launchPadWorld, rocketAt, workAt } from '../src/launchpad'

const gap = (a: number, b: number) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)
const buildLength = BUILD.lower + BUILD.weld + BUILD.settle + BUILD.gap

describe('LAUNCH_PAD', () => {
  it('stands on the ring in the slot beside the cradle, clear of every bay', () => {
    expect(gap(LAUNCH_PAD.angle, CRADLE.angle)).toBeGreaterThan(0.5)
    for (const bay of HUB_LAYOUT.bays) expect(gap(LAUNCH_PAD.angle, bay.angle)).toBeGreaterThan(1)
    const [x, y, z] = launchPadWorld()
    expect(y).toBe(0)
    expect(Math.hypot(x, z)).toBeCloseTo(LAUNCH_PAD.radius, 5)
  })

  it('does not overlap the cradle platform', () => {
    const [px, , pz] = launchPadWorld()
    const [cx, , cz] = cradleToWorld([0, 0, 0])
    expect(Math.hypot(px - cx, pz - cz)).toBeGreaterThan(LAUNCH_PAD.padRadius + CRADLE.platformRadius + 0.5)
  })
})

describe('timing', () => {
  it('builds the whole rocket in 30 seconds after a launch', () => {
    expect(SECTIONS * (REBUILD.lower + REBUILD.weld + REBUILD.settle + REBUILD.gap)).toBeCloseTo(30, 6)
  })
})

describe('workAt (fitting and welding one section)', () => {
  const seen = (timing: typeof BUILD) => {
    const phases: string[] = []
    const length = timing.lower + timing.weld + timing.settle + timing.gap
    for (let t = 0; t < length; t += 0.01) {
      const p = workAt(2, t, timing).work.phase
      if (phases[phases.length - 1] !== p) phases.push(p)
    }
    return phases
  }

  it('goes lower, weld, settle, then (in the slow loop) the crane lifts the section away again', () => {
    expect(seen(BUILD)).toEqual(['lower', 'weld', 'settle', 'raise'])
    expect(seen(REBUILD)).toEqual(['lower', 'weld', 'settle'])
  })

  it('welds the seam steadily from nothing to all of it, with the turntable making exactly one turn', () => {
    let lastWeld = -1
    let lastYaw = -1
    for (let t = BUILD.lower; t < BUILD.lower + BUILD.weld; t += 0.02) {
      const { work, yaw } = workAt(1, t, BUILD)
      expect(work.phase).toBe('weld')
      expect(work.weld).toBeGreaterThanOrEqual(lastWeld)
      expect(yaw).toBeGreaterThanOrEqual(lastYaw)
      lastWeld = work.weld
      lastYaw = yaw
    }
    expect(lastWeld).toBeGreaterThan(0.99)
    expect(lastYaw).toBeGreaterThan(2 * Math.PI - 0.05)
    expect(lastYaw).toBeLessThanOrEqual(2 * Math.PI)
  })

  it('keeps the turntable still, and the seam either unwelded or finished, outside the weld', () => {
    for (let t = 0; t < buildLength; t += 0.05) {
      const { work, yaw } = workAt(0, t, BUILD)
      if (work.phase === 'lower') {
        expect(yaw).toBe(0)
        expect(work.weld).toBe(0)
      }
      if (work.phase === 'settle' || work.phase === 'raise') {
        expect(yaw).toBe(0)
        expect(work.weld).toBe(1)
      }
    }
  })

  it('starts the turntable and ends it at the same orientation, so nothing jumps when the weld ends', () => {
    const start = workAt(0, BUILD.lower + 1e-6, BUILD).yaw
    const end = workAt(0, BUILD.lower + BUILD.weld - 1e-6, BUILD).yaw
    expect(Math.sin(start)).toBeCloseTo(0, 3)
    expect(Math.sin(end)).toBeCloseTo(0, 3)
    expect(Math.cos(end)).toBeCloseTo(1, 3)
  })
})

describe('rocketAt while the project is still building', () => {
  it('has as many solid sections as the demo progress says, and fits the next one', () => {
    for (const [progress, solid] of [[0, 0], [0.2, 1], [0.5, 3], [0.83, 4], [0.99, 5]] as const) {
      const m = rocketAt(progress, 5)
      expect(m.phase).toBe('build')
      expect(m.solid).toBe(solid)
      expect(m.work?.index ?? solid).toBe(solid)
      expect(m.lift).toBe(0)
      expect(m.flame).toBe(0)
    }
  })

  it('never changes the number of finished sections, however long it runs', () => {
    for (let t = 0; t < 120; t += 0.5) expect(rocketAt(0.5, t).solid).toBe(3)
  })

  it('repeats the same go over and over', () => {
    for (const t of [1, 4.2, 9.9]) expect(rocketAt(0.5, t)).toEqual(rocketAt(0.5, t + buildLength))
  })

  it('glows more as the build advances', () => {
    let last = -1
    for (const p of [0, 0.2, 0.5, 0.83, 0.99]) {
      const g = rocketAt(p, 5).glow
      expect(g).toBeGreaterThan(last)
      last = g
    }
  })
})

describe('rocketAt once the build is complete', () => {
  const phases = () => {
    const seen: string[] = []
    for (let t = 0; t < LAUNCH_CYCLE; t += 0.05) {
      const p = rocketAt(1, t).phase
      if (seen[seen.length - 1] !== p) seen.push(p)
    }
    return seen
  }

  it('goes round: waits, counts down, lifts off, is gone, then builds the next rocket', () => {
    expect(phases()).toEqual(['hold', 'countdown', 'lift', 'gone', 'rebuild'])
  })

  it('repeats every cycle, and is whole again exactly when the cycle starts over', () => {
    for (const t of [3, 13.4, 17.2, 30, 50]) {
      const a = rocketAt(1, t)
      const b = rocketAt(1, t + LAUNCH_CYCLE)
      expect(b.phase).toBe(a.phase)
      expect(b.solid).toBe(a.solid)
      expect(b.work?.index).toBe(a.work?.index)
      expect(b.lift).toBeCloseTo(a.lift, 6)
      expect(b.yaw).toBeCloseTo(a.yaw, 6)
    }
    expect(rocketAt(1, 0).solid).toBe(SECTIONS)
    expect(rocketAt(1, LAUNCH_CYCLE - 0.001).work?.index).toBe(SECTIONS - 1)
  })

  it('is whole while it waits, counts down and lifts, with nothing being welded', () => {
    for (let t = 0; t < 21; t += 0.1) {
      const m = rocketAt(1, t)
      expect(m.solid).toBe(SECTIONS)
      expect(m.work).toBeNull()
    }
  })

  it('rises faster and faster during lift-off, with the flame at full', () => {
    let last = -1
    let lastStep = 0
    for (let t = 0; t < LAUNCH_CYCLE; t += 0.05) {
      const m = rocketAt(1, t)
      if (m.phase !== 'lift') continue
      expect(m.lift).toBeGreaterThanOrEqual(last)
      expect(m.flame).toBe(1)
      if (last >= 0) {
        const step = m.lift - last
        expect(step).toBeGreaterThanOrEqual(lastStep - 1e-9)
        lastStep = step
      }
      last = m.lift
    }
    expect(last).toBeGreaterThan(30)
  })

  it('has nothing standing when gone, then builds the next rocket section by section from the bottom', () => {
    let lastSolid = -1
    let lastIndex = -1
    let sawGone = false
    for (let t = 0; t < LAUNCH_CYCLE; t += 0.02) {
      const m = rocketAt(1, t)
      if (m.phase === 'gone') {
        sawGone = true
        expect(m.solid).toBe(0)
        expect(m.work).toBeNull()
      }
      if (m.phase === 'rebuild') {
        expect(m.solid).toBeGreaterThanOrEqual(lastSolid)
        expect(m.work?.index ?? m.solid).toBeGreaterThanOrEqual(lastIndex)
        // the section being fitted is always the first one that is not solid yet
        if (m.work) expect(m.work.index).toBe(m.solid)
        lastSolid = m.solid
        lastIndex = m.work?.index ?? lastIndex
      }
    }
    expect(sawGone).toBe(true)
    expect(lastSolid).toBe(SECTIONS - 1)
  })

  it('lights up the countdown one light at a time', () => {
    const lit = new Set<number>()
    for (let t = 0; t < LAUNCH_CYCLE; t += 0.05) {
      const m = rocketAt(1, t)
      if (m.phase === 'countdown') lit.add(m.lights)
      else if (m.phase === 'hold') expect(m.lights).toBe(0)
    }
    expect([...lit].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('rocketAt with bad input', () => {
  it('treats a progress that is not a number as nothing built, and a time that is not a number as time 0', () => {
    expect(rocketAt(Number.NaN, 3).phase).toBe('build')
    expect(rocketAt(Number.NaN, 3).solid).toBe(0)
    expect(rocketAt(1, Number.NaN)).toEqual(rocketAt(1, 0))
    expect(rocketAt(5, 3).phase).not.toBe('build')
    expect(rocketAt(-2, 3).glow).toBeGreaterThanOrEqual(0)
    expect(rocketAt(0.5, -4)).toEqual(rocketAt(0.5, 0))
  })
})
