import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { DEMO_PROJECTS, type Project } from '../src/projects'
import {
  PLANET_KINDS,
  SYSTEM,
  agentCounts,
  flarePeriod,
  lockedYaw,
  orbitRadius,
  planetAngle,
  planetApproach,
  planetKind,
  planetKinds,
  planetPosition,
  planetSize,
  systemCamera,
} from '../src/systemLayout'

const project = (id: string, over: Partial<Project> = {}): Project => ({
  id,
  name: id,
  accent: '#fff',
  status: 'idle',
  activity: 0,
  progress: 0,
  agents: { planning: 0, development: 0, review: 0 },
  source: 'demo',
  ...over,
})
const ids = (n: number) => Array.from({ length: n }, (_, i) => `project-${i}`)

describe('planetKinds', () => {
  it('gives every one of up to eight projects its own kind', () => {
    const kinds = planetKinds(ids(8))
    expect(new Set(kinds.values()).size).toBe(8)
    for (const k of kinds.values()) expect(PLANET_KINDS).toContain(k)
  })

  it('is the same every time for the same list', () => {
    expect([...planetKinds(ids(6))]).toEqual([...planetKinds(ids(6))])
  })

  it('wraps round when there are more projects than kinds, and still gives every project a kind', () => {
    const kinds = planetKinds(ids(11))
    expect(kinds.size).toBe(11)
    for (const k of kinds.values()) expect(PLANET_KINDS).toContain(k)
  })

  it('planetKind reads one project from the list', () => {
    const list = ids(5)
    expect(planetKind(list, list[3])).toBe(planetKinds(list).get(list[3]))
  })

  it('a project that is not in the list still gets a kind (never undefined)', () => {
    expect(PLANET_KINDS).toContain(planetKind(ids(3), 'someone-else'))
  })
})

describe('orbits', () => {
  it('start outside the star and grow with the place in the list', () => {
    expect(orbitRadius(0)).toBeGreaterThan(SYSTEM.starRadius * 2)
    for (let i = 1; i < 14; i++) expect(orbitRadius(i)).toBeGreaterThan(orbitRadius(i - 1))
  })

  it('keeps a gap between orbits wide enough for the biggest planet and its rings', () => {
    for (let i = 1; i < 14; i++) expect(orbitRadius(i) - orbitRadius(i - 1)).toBeGreaterThan(SYSTEM.minGap)
  })

  it('outer planets move more slowly than inner ones', () => {
    const turn = (i: number) => planetAngle(i, 10) - planetAngle(i, 0)
    expect(Math.abs(turn(0))).toBeGreaterThan(Math.abs(turn(3)))
    expect(Math.abs(turn(3))).toBeGreaterThan(Math.abs(turn(7)))
  })

  it('planetPosition lies on its orbit in the flat plane, at every moment', () => {
    for (const t of [0, 1.5, 40, 1234.5]) {
      const [x, y, z] = planetPosition(4, t)
      expect(y).toBe(0)
      expect(Math.hypot(x, z)).toBeCloseTo(orbitRadius(4), 6)
    }
  })

  it('starts different planets at different angles so they do not line up', () => {
    const a = new Set(Array.from({ length: 8 }, (_, i) => planetAngle(i, 0).toFixed(3)))
    expect(a.size).toBe(8)
  })
})

describe('lockedYaw (the same face always looks at the star)', () => {
  it('turns the globe so its middle meridian (+x) points at the star', () => {
    for (const t of [0, 3, 17.2, 90]) {
      const a = planetAngle(2, t)
      const [x, , z] = planetPosition(2, t)
      const yaw = lockedYaw(a)
      // where the globe's +x axis points after a turn of `yaw` about y (three.js convention)
      const faces = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), yaw)
      const toStar = new Vector3(-x, 0, -z).normalize()
      expect(faces.dot(toStar)).toBeCloseTo(1, 6)
    }
  })
})

describe('planetSize', () => {
  it('gas giants are bigger than rocky worlds, and the current project is a little bigger', () => {
    expect(planetSize('gasring', false)).toBeGreaterThan(planetSize('rocky', false))
    expect(planetSize('gas', false)).toBeGreaterThan(planetSize('barren', false))
    expect(planetSize('ocean', true)).toBeGreaterThan(planetSize('ocean', false))
  })

  it('the biggest planet, rings included, fits inside an orbit gap', () => {
    const biggest = Math.max(...PLANET_KINDS.map((k) => planetSize(k, true)))
    expect(biggest * 2.3 * 2).toBeLessThan(SYSTEM.minGap * 3)
  })
})

describe('agentCounts', () => {
  it('reads live crews: working and waiting agents', () => {
    const live = project('a', {
      status: 'running',
      source: 'live',
      live: { roster: [
        { seated: true, state: 'running' }, { seated: true, state: 'running' }, { seated: true, state: 'needs-you' }, { seated: true, state: 'idle' }, { seated: false, state: 'running' },
      ] } as unknown as Project['live'],
    })
    expect(agentCounts(live)).toEqual({ working: 2, waiting: 1 })
  })

  it('demo projects: working robots from the desk counts, one waiting when it needs you', () => {
    const demo = project('d', { status: 'needs-you', attention: 'review', agents: { planning: 1, development: 2, review: 1 } })
    expect(agentCounts(demo)).toEqual({ working: 4, waiting: 1 })
  })

  it('a resting project has no moons and nothing waiting', () => {
    expect(agentCounts(project('r'))).toEqual({ working: 0, waiting: 0 })
  })

  it('never shows more than five moons', () => {
    const big = project('b', { status: 'running', agents: { planning: 3, development: 3, review: 3 } })
    expect(agentCounts(big).working).toBe(5)
  })

  it('works for every demo project', () => {
    for (const p of DEMO_PROJECTS) {
      const c = agentCounts(p)
      expect(c.working).toBeGreaterThanOrEqual(0)
      expect(c.waiting).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('flarePeriod', () => {
  it('is shorter when more agents work, and long when nothing does', () => {
    expect(flarePeriod(8)).toBeLessThan(flarePeriod(2))
    expect(flarePeriod(2)).toBeLessThan(flarePeriod(0))
    expect(flarePeriod(0)).toBeGreaterThan(15)
    expect(flarePeriod(100)).toBeGreaterThan(3)
  })
})

describe('cameras', () => {
  it('the overview shows the whole system, outer orbit included, on a 16:9 screen', () => {
    for (const n of [4, 8, 12]) {
      const v = systemCamera(n)
      const cam = new PerspectiveCamera(v.fov, 16 / 9, 0.1, 700)
      cam.position.set(...v.position)
      cam.lookAt(new Vector3(...v.target))
      cam.updateMatrixWorld()
      const outer = orbitRadius(n - 1)
      for (const [x, z] of [[outer, 0], [-outer, 0], [0, outer], [0, -outer]]) {
        const p = new Vector3(x, 0, z).project(cam)
        expect(Math.abs(p.x)).toBeLessThan(1)
        expect(Math.abs(p.y)).toBeLessThan(1)
      }
    }
  })

  it('looks down at the system from above and in front, at an angle that shows the orbits as ellipses', () => {
    const v = systemCamera(8)
    expect(v.position[1]).toBeGreaterThan(20)
    expect(v.position[2]).toBeGreaterThan(50)
    const elevation = Math.atan2(v.position[1] - v.target[1], Math.hypot(v.position[0] - v.target[0], v.position[2] - v.target[2]))
    expect(elevation).toBeGreaterThan(0.2)
    expect(elevation).toBeLessThan(0.7)
  })

  it('the approach to a planet puts the camera close to it and looking at it', () => {
    const planet: [number, number, number] = [20, 0, -10]
    const v = planetApproach(planet, 2)
    const d = new Vector3(...v.position).distanceTo(new Vector3(...planet))
    expect(d).toBeGreaterThan(2)
    expect(d).toBeLessThan(14)
    expect(v.target[0]).toBeCloseTo(20, 6)
    expect(v.target[2]).toBeCloseTo(-10, 6)
  })

  it('the approach stays on the star side of the planet so the lit face is seen', () => {
    const planet: [number, number, number] = [30, 0, 0]
    const v = planetApproach(planet, 2)
    expect(v.position[0]).toBeLessThan(planet[0] + 1)
  })
})
