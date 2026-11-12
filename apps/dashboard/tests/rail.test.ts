import { describe, expect, it } from 'vitest'
import { railGroups } from '../src/rail'
import type { Project } from '../src/projects'
import type { RosterEntry } from '../src/live/wire'

const agents = (planning = 0, development = 0, review = 0) => ({ planning, development, review })
function p(id: string, status: Project['status'], over: Partial<Project> = {}): Project {
  return { id, name: id.toUpperCase(), accent: '#fff', status, activity: 0.3, progress: 0, agents: agents(), source: 'demo', ...over }
}
const entry = (state: RosterEntry['state'], seated = true) => ({ state, seated }) as RosterEntry
const live = (roster: RosterEntry[]) => ({ source: 'live' as const, live: { roster } as unknown as Project['live'] })

describe('railGroups', () => {
  it('groups projects into needs you, working and resting, keeping their order, and leaves empty groups out', () => {
    const groups = railGroups([p('a', 'idle'), p('b', 'running'), p('c', 'needs-you'), p('d', 'idle')])
    expect(groups.map((g) => [g.id, g.items.map((i) => i.project.id)])).toEqual([
      ['needs-you', ['c']],
      ['working', ['b']],
      ['resting', ['a', 'd']],
    ])
    expect(railGroups([p('a', 'idle')]).map((g) => g.id)).toEqual(['resting'])
  })

  it('counts waiting and working agents from the crew of a live project', () => {
    const [g] = railGroups([p('a', 'needs-you', live([entry('needs-you'), entry('running'), entry('running'), entry('idle'), entry('running', false)]))])
    expect(g.items[0]).toMatchObject({ waiting: 1, working: 2 })
  })

  it('counts demo robots at work, and one waiting when a demo project needs you', () => {
    const [g] = railGroups([p('a', 'needs-you', { agents: agents(1, 2, 0, 0) })])
    expect(g.items[0]).toMatchObject({ waiting: 1, working: 3 })
    expect(railGroups([p('b', 'idle', { agents: agents(0, 0, 0, 0) })])[0].items[0]).toMatchObject({ waiting: 0, working: 0 })
  })

  it('has a plain-words label for each group', () => {
    expect(railGroups([p('a', 'needs-you'), p('b', 'running'), p('c', 'idle')]).map((g) => g.label)).toEqual(['Needs you', 'Working', 'Resting'])
  })
})
