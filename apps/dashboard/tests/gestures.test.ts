import { describe, expect, it } from 'vitest'
import {
  BREAK_CLIPS, CLICK_GAP, CLICK_GESTURES, GESTURE_CLIPS, GESTURE_SECONDS,
  breakAt, emoteFor, gestureLoops, gestureSeconds, pickGesture, registerClick, tooSoon,
} from '../src/gestures'
import { BAY_VARIANTS, EXTRA_VARIANTS, ROBOT_VARIANTS, type AnyVariant } from '../src/robotVariants'

const ALL_VARIANTS: AnyVariant[] = [...ROBOT_VARIANTS, ...EXTRA_VARIANTS]
const sweep = (n: number) => Array.from({ length: n }, (_, i) => i / n)

describe('pickGesture', () => {
  it('always returns a click gesture and never the one just played', () => {
    for (const variant of ALL_VARIANTS) {
      for (const last of [null, ...CLICK_GESTURES]) {
        for (const r of [...sweep(50), 0.9999, 1]) {
          const g = pickGesture(variant, last, () => r)
          expect(CLICK_GESTURES).toContain(g)
          expect(g).not.toBe(last)
        }
      }
    }
  })

  it('gives each robot its own taste but still shows variety', () => {
    const count = (variant: AnyVariant) => {
      const tally: Record<string, number> = {}
      for (const r of sweep(400)) tally[pickGesture(variant, null, () => r)] = (tally[pickGesture(variant, null, () => r)] ?? 0) + 1
      return tally
    }
    const dev = count('developer')
    expect((dev.dance ?? 0)).toBeGreaterThan(dev.bow ?? 0)
    const cassette = count('cassette')
    expect((cassette.dance ?? 0) + (cassette.dance2 ?? 0)).toBeGreaterThan(cassette.salute ?? 0)
    for (const variant of ALL_VARIANTS) expect(Object.keys(count(variant)).length).toBeGreaterThanOrEqual(5)
  })

  it('keeps the spin rare', () => {
    for (const variant of ['planner', 'developer', 'reviewer', 'tester', 'integrator'] as const) {
      const spins = sweep(500).filter((r) => pickGesture(variant, null, () => r) === 'spin').length
      expect(spins / 500).toBeLessThan(0.08)
    }
  })
})

describe('gesture length', () => {
  it('plays one to three loops, a bow or a salute only once, and counts seconds from the loops', () => {
    for (const clip of GESTURE_CLIPS) {
      for (const r of sweep(20)) {
        const n = gestureLoops(clip, () => r)
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(3)
      }
    }
    expect(gestureLoops('bow', () => 0.99)).toBe(1)
    expect(gestureLoops('salute', () => 0.99)).toBe(1)
    expect(gestureLoops('dance', () => 0.99)).toBeGreaterThan(gestureLoops('dance', () => 0))
    expect(gestureSeconds('dance', 3)).toBe(3 * GESTURE_SECONDS)
  })
})

describe('click rules', () => {
  it('ignores a second click that comes too soon, and a first click', () => {
    expect(tooSoon(null, 5)).toBe(false)
    expect(tooSoon(5, 5 + CLICK_GAP / 2)).toBe(true)
    expect(tooSoon(5, 5 + CLICK_GAP + 0.01)).toBe(false)
  })

  it('notices a flurry of four quick clicks, then starts counting again', () => {
    let recent: number[] = []
    const results: boolean[] = []
    for (const t of [0, 0.7, 1.4, 2.1]) {
      const r = registerClick(recent, t)
      recent = r.recent
      results.push(r.excited)
    }
    expect(results).toEqual([false, false, false, true])
    expect(recent).toHaveLength(0)
  })

  it('forgets clicks older than the window', () => {
    let recent: number[] = []
    for (const t of [0, 1, 2, 10]) recent = registerClick(recent, t).recent
    expect(recent).toEqual([10])
    expect(registerClick([0, 1, 2], 10).excited).toBe(false)
  })
})

describe('emoteFor', () => {
  it('has a short symbol for every gesture', () => {
    for (const clip of GESTURE_CLIPS) expect(emoteFor(clip).length).toBeGreaterThan(0)
  })
})

describe('breakAt (small breaks for seated robots)', () => {
  it('is the same every time, uses only break clips, and stays inside its window', () => {
    for (const seed of [1, 2, 3, 99]) {
      for (let t = 0; t < 300; t += 0.5) {
        const b = breakAt(seed, t)
        expect(breakAt(seed, t)).toEqual(b)
        if (b) {
          expect(BREAK_CLIPS).toContain(b.clip)
          expect(b.start).toBeLessThanOrEqual(t)
          expect(b.end).toBeGreaterThan(t)
        }
      }
    }
  })

  it('takes breaks only a small part of the time, at different moments for different robots', () => {
    let busy = 0
    let samples = 0
    for (let t = 0; t < 600; t += 0.5) {
      samples++
      if (breakAt(7, t)) busy++
    }
    expect(busy / samples).toBeGreaterThan(0.05)
    expect(busy / samples).toBeLessThan(0.25)
    const starts = (seed: number) => new Set(Array.from({ length: 200 }, (_, i) => breakAt(seed, i)?.start).filter((v) => v !== undefined))
    expect([...starts(1)].join()).not.toBe([...starts(2)].join())
  })

  it('returns nothing for bad times', () => {
    for (const t of [NaN, -3, Infinity]) expect(breakAt(1, t)).toBeNull()
  })
})

describe('bay shapes are in the shape lists', () => {
  it('lists the five new shapes among the extra ones', () => {
    expect([...BAY_VARIANTS]).toEqual(['terminal', 'gauge', 'plug', 'cassette', 'fishbowl'])
    for (const v of BAY_VARIANTS) expect(EXTRA_VARIANTS).toContain(v)
  })
})
