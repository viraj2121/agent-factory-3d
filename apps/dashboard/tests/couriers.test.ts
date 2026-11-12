import { describe, expect, it } from 'vitest'
import { COURIER, courierView, createCouriers, stepCouriers, type CourierSim } from '../src/couriers'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'
import { REST } from '../src/restBunks'

// the couriers stop at every bay and at the rest docks
const STOPS = [...HUB_LAYOUT.bays.map((b) => b.angle), REST.angle]

const DT = 1 / 30

/** Runs the sim for `seconds`, calling `each` after every step. */
function run(sim: CourierSim, seconds: number, each: (sim: CourierSim) => void, frozen: boolean[] = []) {
  for (let i = 0; i < seconds / DT; i++) {
    stepCouriers(sim, DT, frozen)
    each(sim)
  }
}

const angleOf = (p: number[]) => Math.atan2(p[0], p[2])
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

describe('couriers', () => {
  it('stay finite, on the floor, between the core deck and the bays, on two separate lanes', () => {
    const sim = createCouriers(7)
    run(sim, 300, (s) => {
      const views = [courierView(s, 0), courierView(s, 1)]
      for (const v of views) {
        expect(v.position.every(Number.isFinite)).toBe(true)
        expect(Number.isFinite(v.yaw)).toBe(true)
        expect(v.position[1]).toBe(0)
        const r = Math.hypot(v.position[0], v.position[2])
        expect(r).toBeGreaterThan(HUB.deckRadius + 1)
        expect(r).toBeLessThan(HUB_LAYOUT.bays[0].radius - 2)
      }
      const [a, b] = views.map((v) => v.position)
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.4)
    })
  })

  it('walk at a sensible pace and speed up and slow down smoothly, never jumping', () => {
    const sim = createCouriers(7)
    let before = [courierView(sim, 0).position, courierView(sim, 1).position]
    const speeds: number[][] = [[], []]
    run(sim, 200, (s) => {
      for (const i of [0, 1]) {
        const p = courierView(s, i).position
        const v = Math.hypot(p[0] - before[i][0], p[2] - before[i][2]) / DT
        expect(v).toBeLessThan(COURIER.walkSpeed * 1.25)
        speeds[i].push(v)
        before[i] = p
      }
    })
    for (const list of speeds) {
      for (let i = 1; i < list.length; i++) expect(Math.abs(list[i] - list[i - 1])).toBeLessThan(0.1)
      expect(Math.max(...list)).toBeGreaterThan(0.6)
      expect(list.filter((v) => v < 0.02).length).toBeGreaterThan(30)
    }
  })

  it('stop at the bays and the rest docks to hand over, visit most of them, and sometimes turn back', () => {
    const sim = createCouriers(7)
    const visited = new Set<number>()
    let handovers = 0
    let wasHanding = [false, false]
    const directions = new Set<number>()
    run(sim, 600, (s) => {
      for (const i of [0, 1]) {
        const v = courierView(s, i)
        const handing = v.clip === 'assemble'
        if (handing && !wasHanding[i]) {
          handovers++
          const a = angleOf(v.position)
          const bay = STOPS.findIndex((stop) => Math.abs(wrap(stop - a)) < 0.03)
          expect(bay).toBeGreaterThanOrEqual(0)
          visited.add(bay)
        }
        wasHanding[i] = handing
        directions.add(s.couriers[i].dir)
      }
    })
    expect(handovers).toBeGreaterThan(10)
    expect(visited.size).toBe(STOPS.length)
    expect(directions.size).toBe(2)
  })

  it('carry a package only while walking or looking about, and not while handing it over', () => {
    const sim = createCouriers(7)
    const seen = { carrying: false, empty: false }
    run(sim, 200, (s) => {
      for (const i of [0, 1]) {
        const v = courierView(s, i)
        if (v.clip === 'assemble') expect(v.carrying).toBe(false)
        if (v.clip === 'walk') expect(v.carrying).toBe(true)
        if (v.carrying) seen.carrying = true
        else seen.empty = true
      }
    })
    expect(seen).toEqual({ carrying: true, empty: true })
  })

  it('pause to look around sometimes, with a different clip from walking', () => {
    const sim = createCouriers(7)
    const clips = new Set<string>()
    run(sim, 600, (s) => {
      for (const i of [0, 1]) clips.add(courierView(s, i).clip)
    })
    for (const clip of ['walk', 'assemble', 'idle2', 'highfive']) expect(clips).toContain(clip)
  })

  it('greet each other with a high five when they meet, facing each other, then carry on', () => {
    const sim = createCouriers(7)
    let greetings = 0
    let wasGreeting = false
    run(sim, 600, (s) => {
      const [a, b] = [courierView(s, 0), courierView(s, 1)]
      const greeting = a.clip === 'highfive' && b.clip === 'highfive'
      if (greeting && !wasGreeting) greetings++
      wasGreeting = greeting
      if (greeting && s.couriers[0].timer < 1.2) {
        const toOther = Math.atan2(b.position[0] - a.position[0], b.position[2] - a.position[2])
        expect(Math.abs(wrap(a.yaw - toOther))).toBeLessThan(0.7)
      }
    })
    expect(greetings).toBeGreaterThanOrEqual(2)
    expect(greetings).toBeLessThan(40)
  })

  it('turn at a limited rate, so they never snap round', () => {
    const sim = createCouriers(7)
    let yaw = [courierView(sim, 0).yaw, courierView(sim, 1).yaw]
    run(sim, 300, (s) => {
      for (const i of [0, 1]) {
        const y = courierView(s, i).yaw
        expect(Math.abs(wrap(y - yaw[i])) / DT).toBeLessThan(COURIER.turnRate * 1.3)
        yaw[i] = y
      }
    })
  })

  it('are the same every time for the same seed and differ for another', () => {
    const final = (seed: number) => {
      const sim = createCouriers(seed)
      const path: number[][] = []
      run(sim, 240, (s) => {
        if (Math.round(s.time * 30) % 150 === 0) path.push(courierView(s, 0).position)
      })
      return path
    }
    expect(final(7)).toEqual(final(7))
    expect(final(7)).not.toEqual(final(8))
  })

  it('stand still while frozen (for example while you click one) and carry on afterwards', () => {
    const sim = createCouriers(7)
    run(sim, 20, () => {})
    const held = courierView(sim, 0).position
    const other = courierView(sim, 1).position
    run(sim, 10, () => {}, [true, false])
    expect(courierView(sim, 0).position).toEqual(held)
    expect(courierView(sim, 1).position).not.toEqual(other)
    run(sim, 10, () => {})
    expect(courierView(sim, 0).position).not.toEqual(held)
  })

  it('cope with a long pause between frames and with bad step sizes', () => {
    const sim = createCouriers(7)
    stepCouriers(sim, 5, [])
    stepCouriers(sim, -1, [])
    stepCouriers(sim, NaN, [])
    for (const i of [0, 1]) expect(courierView(sim, i).position.every(Number.isFinite)).toBe(true)
  })
})
