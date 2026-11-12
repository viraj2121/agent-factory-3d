import { describe, expect, it } from 'vitest'
import { seatClip } from '../src/robotVariants'
import { DEMO_PROJECTS } from '../src/projects'
import { DEPARTMENTS } from '../src/hallLayout'

describe('seatClip', () => {
  it('gives every seat a clip the robot has, mostly the department work clip', () => {
    const clips = Array.from({ length: 30 }, (_, seed) => seatClip('developer', seed))
    expect(new Set(clips).size).toBeGreaterThan(1)
    expect(clips.filter((c) => c === 'typing').length).toBeGreaterThan(15)
  })
})

describe('project attention', () => {
  it('names a real department only for projects that need you', () => {
    for (const p of DEMO_PROJECTS) {
      if (p.status === 'needs-you') expect(DEPARTMENTS).toContain(p.attention)
      else expect(p.attention).toBeUndefined()
    }
    expect(DEMO_PROJECTS.some((p) => p.status === 'needs-you')).toBe(true)
  })
})
