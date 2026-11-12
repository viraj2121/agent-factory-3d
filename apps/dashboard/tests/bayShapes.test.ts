import { describe, expect, it } from 'vitest'
import { SEAT_SHAPES, seatShapes } from '../src/bayShapes'
import { BAY_VARIANTS, ROBOT_VARIANTS } from '../src/robotVariants'
import { DEPARTMENTS } from '../src/hallLayout'
import { DEMO_PROJECTS } from '../src/projects'

describe('seatShapes', () => {
  it('can pick any of the ten shapes: the five department robots and the five bay shapes', () => {
    expect(new Set(SEAT_SHAPES)).toEqual(new Set([...ROBOT_VARIANTS, ...BAY_VARIANTS]))
    expect(SEAT_SHAPES).toHaveLength(10)
  })

  it('gives each seat a shape, never the same shape twice in one bay', () => {
    for (const p of DEMO_PROJECTS) {
      DEPARTMENTS.forEach((_, d) => {
        const shapes = seatShapes(p.id, d, 3)
        expect(shapes).toHaveLength(3)
        expect(new Set(shapes).size).toBe(3)
        for (const s of shapes) expect(SEAT_SHAPES).toContain(s)
      })
    }
  })

  it('is stable for a project and bay, and changes between projects', () => {
    expect(seatShapes('atlas', 2, 3)).toEqual(seatShapes('atlas', 2, 3))
    const layouts = DEMO_PROJECTS.map((p) => DEPARTMENTS.map((_, d) => seatShapes(p.id, d, 3).join()).join('|'))
    expect(new Set(layouts).size).toBe(DEMO_PROJECTS.length)
  })

  it('is not tied to a department: over many projects every shape turns up in every bay', () => {
    const bays: Record<string, Set<number>> = {}
    for (let k = 0; k < 40; k++) {
      DEPARTMENTS.forEach((_, d) => {
        for (const s of seatShapes(`project-${k}`, d, 3)) (bays[s] ??= new Set()).add(d)
      })
    }
    for (const shape of SEAT_SHAPES) expect(bays[shape]?.size).toBe(DEPARTMENTS.length)
  })

  it('handles a bay with no or few seats', () => {
    expect(seatShapes('x', 0, 0)).toEqual([])
    expect(seatShapes('x', 0, 1)).toHaveLength(1)
    expect(seatShapes('x', -1, 2)).toHaveLength(2)
  })
})
