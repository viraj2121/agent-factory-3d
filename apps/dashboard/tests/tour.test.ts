import { describe, expect, it } from 'vitest'
import { hubCameraFor } from '../src/hubCameraConfig'
import { HUB_LAYOUT } from '../src/hubLayout'
import { IDLE_AFTER, TOUR_STOPS, createTour, noteInput, stepTour } from '../src/tour'

const on = { enabled: true, blocked: false }

describe('tour stops', () => {
  it('each point to a real camera view', () => {
    for (const stop of TOUR_STOPS) {
      const v = hubCameraFor(stop.focus)
      expect([...v.position, ...v.target, v.fov].every(Number.isFinite), String(stop.focus)).toBe(true)
      expect(stop.fly).toBeGreaterThan(1500)
      expect(stop.hold).toBeGreaterThan(2000)
    }
  })

  it('visit every bay, the core, the studio and the sky', () => {
    const focuses = TOUR_STOPS.map((s) => s.focus)
    for (const bay of HUB_LAYOUT.bays) expect(focuses).toContain(bay.id)
    for (const f of ['orb', 'studio', 'sky', 'launchpad', 'library']) expect(focuses).toContain(f)
  })
})

describe('starting', () => {
  it('waits for the idle time before the first move', () => {
    let s = createTour(0)
    for (let t = 1; t < IDLE_AFTER; t += 1) {
      const r = stepTour(s, t, on)
      expect(r.go).toBeNull()
      s = r.state
    }
    expect(s.touring).toBe(false)
  })

  it('sets off to the first stop once nothing has happened for the idle time', () => {
    const r = stepTour(createTour(0), IDLE_AFTER, on)
    expect(r.go).toEqual(TOUR_STOPS[0])
    expect(r.state.touring).toBe(true)
  })

  it('does nothing while switched off or blocked, and starts the idle wait afresh afterwards', () => {
    const off = stepTour(createTour(0), 100, { enabled: false, blocked: false })
    expect(off.go).toBeNull()
    expect(off.state.touring).toBe(false)
    const stillWaiting = stepTour(off.state, 100 + IDLE_AFTER - 1, on)
    expect(stillWaiting.go).toBeNull()
    expect(stepTour(stillWaiting.state, 100 + IDLE_AFTER, on).go).not.toBeNull()
    expect(stepTour(createTour(0), 100, { enabled: true, blocked: true }).go).toBeNull()
  })
})

describe('start delay from the settings', () => {
  it('waits the chosen number of seconds instead of the default', () => {
    const s = createTour(0)
    expect(stepTour(s, 14, { enabled: true, blocked: false, idleAfter: 15 }).go).toBeNull()
    expect(stepTour(s, 15, { enabled: true, blocked: false, idleAfter: 15 }).go).not.toBeNull()
    expect(stepTour(s, 59, { enabled: true, blocked: false, idleAfter: 60 }).go).toBeNull()
  })
})

describe('touring', () => {
  it('stays on a stop while it flies and holds, then moves to the next', () => {
    const first = stepTour(createTour(0), IDLE_AFTER, on)
    const stop = TOUR_STOPS[0]
    const wait = (stop.fly + stop.hold) / 1000
    expect(stepTour(first.state, IDLE_AFTER + wait - 0.1, on).go).toBeNull()
    const next = stepTour(first.state, IDLE_AFTER + wait, on)
    expect(next.go).toEqual(TOUR_STOPS[1])
  })

  it('goes round and starts again after the last stop', () => {
    let r = stepTour(createTour(0), IDLE_AFTER, on)
    let t = IDLE_AFTER
    const seen: unknown[] = [r.go]
    for (let i = 1; i <= TOUR_STOPS.length; i++) {
      const prev = r.go!
      t += (prev.fly + prev.hold) / 1000
      r = stepTour(r.state, t, on)
      seen.push(r.go)
    }
    expect(seen.slice(0, TOUR_STOPS.length)).toEqual(TOUR_STOPS)
    expect(seen[TOUR_STOPS.length]).toEqual(TOUR_STOPS[0])
  })

  it('stops as soon as it is blocked or switched off', () => {
    const first = stepTour(createTour(0), IDLE_AFTER, on)
    const blocked = stepTour(first.state, IDLE_AFTER + 1, { enabled: true, blocked: true })
    expect(blocked.state.touring).toBe(false)
    expect(blocked.go).toBeNull()
  })

  it('carries on from the next stop the next time, not always the first', () => {
    const first = stepTour(createTour(0), IDLE_AFTER, on)
    const { state } = noteInput(first.state, IDLE_AFTER + 1)
    const again = stepTour(state, IDLE_AFTER + 1 + IDLE_AFTER, on)
    expect(again.go).toEqual(TOUR_STOPS[1])
  })
})

describe('input', () => {
  it('ends a tour and asks for the flight to stop', () => {
    const first = stepTour(createTour(0), IDLE_AFTER, on)
    const r = noteInput(first.state, IDLE_AFTER + 2)
    expect(r.stopFlight).toBe(true)
    expect(r.state.touring).toBe(false)
  })

  it('only restarts the idle wait when nothing was touring', () => {
    const r = noteInput(createTour(0), 20)
    expect(r.stopFlight).toBe(false)
    expect(stepTour(r.state, 20 + IDLE_AFTER - 1, on).go).toBeNull()
    expect(stepTour(r.state, 20 + IDLE_AFTER, on).go).not.toBeNull()
  })

  it('ignores a time that is not a number', () => {
    const s = createTour(0)
    expect(stepTour(s, Number.NaN, on).go).toBeNull()
    expect(noteInput(s, Number.NaN).state).toEqual(s)
  })
})
