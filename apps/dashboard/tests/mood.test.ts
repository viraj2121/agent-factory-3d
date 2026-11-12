import { describe, expect, it } from 'vitest'
import { moodFor, stripGlow } from '../src/mood'
import { WAY } from '../src/Wayfinding'
import { DEPARTMENTS } from '../src/hallLayout'

describe('moodFor', () => {
  it('breathes gently while running and faster when busier, never going dark', () => {
    const calm = moodFor('running', 0.2, 1.3)
    const busy = moodFor('running', 0.9, 1.3)
    for (const m of [calm, busy]) {
      expect(m.intensity).toBeGreaterThan(0.8)
      expect(m.intensity).toBeLessThan(1.25)
    }
    expect(Math.abs(busy.intensity - 1)).toBeGreaterThanOrEqual(Math.abs(calm.intensity - 1) - 1e-9)
  })

  it('goes warm amber when the project needs you, and dimmer when idle', () => {
    const run = moodFor('running', 0.5, 0)
    const alert = moodFor('needs-you', 0.5, 0)
    const idle = moodFor('idle', 0.1, 0)
    expect(alert.color[0]).toBeGreaterThan(alert.color[2])
    expect(alert.color[0] - alert.color[2]).toBeGreaterThan(run.color[0] - run.color[2])
    expect(idle.intensity).toBeLessThan(run.intensity)
  })

  it('stays finite for any time', () => {
    for (const t of [-5, 0, 1e9, NaN]) {
      const m = moodFor('needs-you', 0.5, t)
      expect([m.intensity, ...m.color].every(Number.isFinite)).toBe(true)
    }
  })
})

describe('wayfinding', () => {
  it('gives every department its own colour and its own emblem shape', () => {
    expect(new Set(DEPARTMENTS.map((d) => WAY[d].color)).size).toBe(DEPARTMENTS.length)
    const shapes = DEPARTMENTS.map((d) => `${WAY[d].sides}-${Math.round((WAY[d].turn * 100) % 628)}`)
    expect(new Set(shapes).size).toBe(DEPARTMENTS.length)
  })
})

describe('stripGlow', () => {
  it('is steady while running, dim when idle, and pulses between bright and half when it needs you', () => {
    expect(stripGlow('running', 0)).toBe(1)
    expect(stripGlow('running', 7.3)).toBe(1)
    expect(stripGlow('idle', 3)).toBeLessThan(0.5)
    const pulse = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => stripGlow('needs-you', t))
    expect(Math.max(...pulse)).toBeLessThanOrEqual(1)
    expect(Math.min(...pulse)).toBeGreaterThanOrEqual(0.5)
    expect(Math.max(...pulse) - Math.min(...pulse)).toBeGreaterThan(0.2)
  })

  it('stays finite for any time', () => {
    for (const t of [-5, NaN, 1e9]) expect(Number.isFinite(stripGlow('needs-you', t))).toBe(true)
  })
})
