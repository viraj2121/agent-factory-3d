import { describe, expect, it } from 'vitest'
import { GESTURE_CLIPS } from '../src/robotVariants'
import { DEFAULT_VOLUME, distanceGain, gestureNotes, masterGain, humSettings, nearGain, nextTypingDelay, panFor, tubeNotes, typingGain } from '../src/sound'

describe('distanceGain', () => {
  it('is full close by and quieter further away', () => {
    expect(distanceGain(0)).toBe(1)
    expect(distanceGain(4)).toBe(1)
    expect(distanceGain(10)).toBeLessThan(1)
    expect(distanceGain(30)).toBeLessThan(distanceGain(10))
    expect(distanceGain(30)).toBeGreaterThan(0)
  })

  it('is silent for nonsense distances', () => {
    expect(distanceGain(Number.NaN)).toBe(0)
    expect(distanceGain(-3)).toBe(1)
  })
})

describe('panFor', () => {
  const cam: [number, number, number] = [0, 5, 20]
  const right: [number, number, number] = [1, 0, 0]

  it('puts a sound on the right when it is to the right of the camera', () => {
    expect(panFor(cam, right, [8, 3, 0])).toBeGreaterThan(0.3)
  })

  it('puts a sound on the left when it is to the left', () => {
    expect(panFor(cam, right, [-8, 3, 0])).toBeLessThan(-0.3)
  })

  it('is centred straight ahead', () => {
    expect(Math.abs(panFor(cam, right, [0, 3, 0]))).toBeLessThan(0.01)
  })

  it('stays within -0.85 and 0.85, and centred for bad input', () => {
    expect(panFor(cam, right, [1000, 0, 20])).toBeLessThanOrEqual(0.85)
    expect(panFor(cam, right, [-1000, 0, 20])).toBeGreaterThanOrEqual(-0.85)
    expect(panFor(cam, right, [Number.NaN, 0, 0])).toBe(0)
    expect(panFor(cam, right, cam)).toBe(0)
  })
})

describe('humSettings', () => {
  it('hums higher and louder for a busier project', () => {
    const calm = humSettings(0.1, 10)
    const busy = humSettings(0.9, 10)
    expect(busy.frequency).toBeGreaterThan(calm.frequency)
    expect(busy.gain).toBeGreaterThan(calm.gain)
  })

  it('is louder close to the core but never fully gone far away', () => {
    expect(humSettings(0.5, 3).gain).toBeGreaterThan(humSettings(0.5, 40).gain)
    expect(humSettings(0.5, 40).gain).toBeGreaterThan(0)
  })

  it('stays quiet and low whatever it is given', () => {
    for (const [a, d] of [[Number.NaN, 5], [5, Number.NaN], [-2, 5], [3, 5]]) {
      const h = humSettings(a, d)
      expect(h.gain).toBeGreaterThanOrEqual(0)
      expect(h.gain).toBeLessThan(0.2)
      expect(h.frequency).toBeGreaterThan(40)
      expect(h.frequency).toBeLessThan(90)
    }
  })
})

describe('typing', () => {
  it('is only heard close to a bay with robots at work', () => {
    expect(typingGain(3, 5)).toBeGreaterThan(0)
    expect(typingGain(0, 5)).toBe(0)
    expect(typingGain(3, 40)).toBe(0)
  })

  it('is louder for more robots and closer', () => {
    expect(typingGain(3, 5)).toBeGreaterThan(typingGain(1, 5))
    expect(typingGain(2, 4)).toBeGreaterThan(typingGain(2, 10))
  })

  it('waits a short random time between key taps', () => {
    expect(nextTypingDelay(() => 0)).toBeGreaterThan(0.04)
    expect(nextTypingDelay(() => 0.999)).toBeLessThan(0.6)
    expect(nextTypingDelay(() => Number.NaN)).toBeGreaterThan(0)
  })
})

describe('notes', () => {
  it('give every gesture a short sound', () => {
    for (const clip of GESTURE_CLIPS) {
      const notes = gestureNotes(clip)
      expect(notes.length, clip).toBeGreaterThan(0)
      for (const n of notes) {
        expect(n.frequency).toBeGreaterThan(80)
        expect(n.frequency).toBeLessThan(2500)
        expect(n.duration).toBeGreaterThan(0)
        expect(n.start).toBeGreaterThanOrEqual(0)
        expect(n.start + n.duration).toBeLessThan(2.5)
        expect(n.gain).toBeGreaterThan(0)
        expect(n.gain).toBeLessThanOrEqual(0.2)
      }
    }
  })

  it('give a finished task a brighter sound than an ordinary arrival', () => {
    const top = (kind: 'arrive' | 'finish') => Math.max(...tubeNotes(kind).map((n) => n.frequency))
    expect(top('finish')).toBeGreaterThan(top('arrive'))
    expect(tubeNotes('finish').length).toBeGreaterThan(tubeNotes('arrive').length - 1)
  })
})

describe('nearGain (sounds that belong to one corner of the hall)', () => {
  it('is full close by, fades to nothing at the edge of the corner, and never goes back up', () => {
    expect(nearGain(0)).toBe(1)
    expect(nearGain(4)).toBe(1)
    expect(nearGain(18)).toBe(0)
    expect(nearGain(40)).toBe(0)
    let last = 2
    for (let d = 0; d <= 22; d += 0.5) {
      const g = nearGain(d)
      expect(g).toBeLessThanOrEqual(last)
      expect(g).toBeGreaterThanOrEqual(0)
      last = g
    }
  })

  it('lets a larger corner reach further', () => {
    expect(nearGain(14, 30)).toBeGreaterThan(nearGain(14, 18))
  })

  it('is silent for a distance that is not a number', () => {
    expect(nearGain(Number.NaN)).toBe(0)
  })
})

describe('masterGain (the volume slider)', () => {
  it('is silent at 0, rises steadily, and never goes outside its range', () => {
    expect(masterGain(0)).toBe(0)
    let last = -1
    for (let v = 0; v <= 1; v += 0.05) {
      expect(masterGain(v)).toBeGreaterThanOrEqual(last)
      last = masterGain(v)
    }
    expect(masterGain(1)).toBeCloseTo(1.2, 9)
    expect(masterGain(5)).toBe(masterGain(1))
    expect(masterGain(-3)).toBe(0)
    expect(masterGain(Number.NaN)).toBe(0)
  })

  it('starts quieter than the level that was too loud before', () => {
    // that level was a master gain of 1 (slider at about 0.83)
    expect(masterGain(DEFAULT_VOLUME)).toBeLessThan(0.6)
    expect(masterGain(DEFAULT_VOLUME)).toBeGreaterThan(0.3)
  })
})
