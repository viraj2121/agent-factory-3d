import { describe, expect, it } from 'vitest'
import { hubCameraFor } from '../src/hubCameraConfig'
import { CATEGORIES, FOCUS_AREAS, fadeToward, focusAt, focusName, lookPoint, mixFor, type FocusId } from '../src/soundFocus'
import type { Vec3 } from '../src/hallLayout'

/** What has the focus for one of the camera presets: the point the camera orbits, as the page reads it from the controls. */
function focusOf(focus: string | undefined): FocusId {
  return focusAt(hubCameraFor(focus).target)
}

describe('lookPoint', () => {
  it('finds where a camera looking down at the hall is looking, at about the height of a robot', () => {
    const p = lookPoint([0, 10, 10], [0, -0.7071, -0.7071])!
    expect(p[1]).toBeCloseTo(1.2, 9)
    expect(p[2]).toBeCloseTo(10 - 8.8, 6)
  })

  it('is nothing when the camera looks level, up, or at something absurdly far away', () => {
    expect(lookPoint([0, 5, 5], [0, 0, -1])).toBeNull()
    expect(lookPoint([0, 5, 5], [0, 0.5, -0.8])).toBeNull()
    expect(lookPoint([0, 5000, 5], [0, -0.05, -1])).toBeNull()
  })

  it('is nothing for numbers that are not numbers', () => {
    expect(lookPoint([Number.NaN, 5, 5], [0, -1, 0])).toBeNull()
    expect(lookPoint([0, 5, 5], [0, Number.NaN, 0])).toBeNull()
  })
})

describe('focusAt', () => {
  it('picks each element at its own middle', () => {
    for (const a of FOCUS_AREAS) expect(focusAt([a.x, 1, a.z])).toBe(a.id)
  })

  it('is the whole hall when the point is nowhere near any element, or there is no point', () => {
    expect(focusAt([60, 1, 60])).toBe('overview')
    expect(focusAt(null)).toBe('overview')
  })

  it('gives every element room that does not overlap another one', () => {
    for (const a of FOCUS_AREAS) {
      for (const b of FOCUS_AREAS) {
        if (a === b) continue
        // the middle of one is never inside the other, so each can always be focused on its own
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(b.radius * 0.5)
      }
    }
  })
})

describe('the camera presets', () => {
  it('start on the core, and the Core button stays on it', () => {
    expect(focusOf(undefined)).toBe('core')
    expect(focusOf('orb')).toBe('core')
  })

  it('look at the right element for every close-up', () => {
    expect(focusOf('planning')).toBe('bay:planning')
    expect(focusOf('development')).toBe('bay:development')
    expect(focusOf('review')).toBe('bay:review')
    expect(focusOf('rest')).toBe('rest')
    expect(focusOf('studio')).toBe('studio')
    expect(focusOf('launchpad')).toBe('pad')
    expect(focusOf('library')).toBe('library')
  })

  it('look at the whole hall from the sky view', () => {
    expect(focusOf('sky')).toBe('overview')
  })
})

describe('mixFor', () => {
  const loud = (id: FocusId) => CATEGORIES.filter((c) => mixFor(id)[c] > 0)

  it('lets only the focused element be heard', () => {
    expect(loud('core')).toEqual(['hum'])
    expect(loud('pad')).toEqual(['pad'])
    expect(loud('library')).toEqual(['library'])
    expect(loud('belt')).toEqual(['belt'])
    expect(loud('bay:review')).toEqual(['typing'])
  })

  it('is silent at the studio, which has no sounds of its own', () => {
    expect(loud('studio')).toEqual([])
  })

  it('has the ambience of the whole hall only when nothing in particular is in focus', () => {
    expect(loud('overview')).toEqual(['hum', 'tubes', 'weather'])
    expect(mixFor('overview').hum).toBeLessThan(1)
  })

  it('never mutes a sound it has not been asked to, and gives every category a level', () => {
    for (const a of FOCUS_AREAS) {
      const mix = mixFor(a.id)
      for (const c of CATEGORIES) {
        expect(mix[c]).toBeGreaterThanOrEqual(0)
        expect(mix[c]).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('fadeToward', () => {
  it('moves smoothly toward the target and never overshoots', () => {
    let level = 0
    let last = 0
    for (let i = 0; i < 200; i++) {
      level = fadeToward(level, 1, 1 / 60)
      expect(level).toBeGreaterThanOrEqual(last)
      expect(level).toBeLessThanOrEqual(1)
      last = level
    }
    expect(level).toBeGreaterThan(0.99)
  })

  it('fades out the same way, and does nothing with a time that is not sensible', () => {
    expect(fadeToward(1, 0, 0.1)).toBeLessThan(1)
    expect(fadeToward(1, 0, 0.1)).toBeGreaterThan(0)
    expect(fadeToward(0.4, 1, 0)).toBe(0.4)
    expect(fadeToward(0.4, 1, Number.NaN)).toBe(0.4)
  })

  it('takes a fraction of a second to get most of the way', () => {
    let level = 0
    for (let i = 0; i < 60; i++) level = fadeToward(level, 1, 1 / 60)
    expect(level).toBeGreaterThan(0.9)
    let early = 0
    for (let i = 0; i < 6; i++) early = fadeToward(early, 1, 1 / 60)
    expect(early).toBeLessThan(0.3)
  })
})

describe('focusName', () => {
  it('has a plain name for every focus', () => {
    for (const a of FOCUS_AREAS) expect(focusName(a.id).length).toBeGreaterThan(2)
    expect(focusName('overview')).toMatch(/hall/)
    const none: Vec3 = [0, 0, 0]
    expect(focusAt(none)).toBe('core')
  })
})
