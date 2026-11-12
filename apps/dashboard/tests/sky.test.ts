import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_ID, DEMO_PROJECTS, projectFor } from '../src/projects'
import { skyCamera } from '../src/skyLayout'
import { flightAt, ease } from '../src/flight'
import { DEPARTMENTS } from '../src/hallLayout'

describe('projects', () => {
  it('has distinct ids, names and accent colours', () => {
    for (const key of ['id', 'name', 'accent'] as const) {
      expect(new Set(DEMO_PROJECTS.map((p) => p[key])).size, key).toBe(DEMO_PROJECTS.length)
    }
  })

  it('gives every project a seat count for every department that fits a bay', () => {
    for (const p of DEMO_PROJECTS) {
      for (const d of DEPARTMENTS) {
        expect(p.agents[d], `${p.id} ${d}`).toBeGreaterThanOrEqual(0)
        expect(p.agents[d], `${p.id} ${d}`).toBeLessThanOrEqual(3)
      }
      expect(p.activity).toBeGreaterThanOrEqual(0)
      expect(p.activity).toBeLessThanOrEqual(1)
    }
  })

  it('falls back to the default project for unknown, empty or missing ids', () => {
    expect(projectFor('beacon').id).toBe('beacon')
    for (const bad of ['nope', '', null, undefined]) expect(projectFor(bad).id).toBe(DEFAULT_PROJECT_ID)
  })
})

describe('skyCamera', () => {
  it('looks from in front of and above the hub at a point behind it, so the hall sits against the sky', () => {
    const c = skyCamera()
    expect(c.position[2]).toBeGreaterThan(0)
    expect(c.target[2]).toBeLessThan(0)
  })
})

describe('flightAt', () => {
  const a = { position: [0, 10, 20], target: [0, 1, 0], fov: 37 } as const
  const b = { position: [40, 12, -30], target: [50, 7, -50], fov: 34 } as const

  it('is the start at 0 and the end at 1', () => {
    expect(flightAt(a, b, 0)).toEqual(a)
    expect(flightAt(a, b, 1)).toEqual(b)
  })

  it('eases: slow at the ends, fastest in the middle, never backwards', () => {
    expect(ease(0.1)).toBeLessThan(0.1)
    expect(ease(0.9)).toBeGreaterThan(0.9)
    let last = -1
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = ease(t)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
  })

  it('clamps out-of-range and non-numeric progress', () => {
    expect(flightAt(a, b, -3)).toEqual(a)
    expect(flightAt(a, b, 9)).toEqual(b)
    expect(flightAt(a, b, NaN)).toEqual(a)
  })
})
