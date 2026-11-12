import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { scanCodex } from '../src/adapters/codex.ts'

const NOW = 1_800_000_000_000

interface Row {
  id: string
  source: string
  cwd?: string
  title?: string
  agent_role?: string | null
  agent_nickname?: string | null
  updatedSecondsAgo?: number
}

function fixture(rows: Row[], edges: [string, string][] = [], withAgentColumns = true) {
  const home = mkdtempSync(join(tmpdir(), 'codex-sub-'))
  mkdirSync(join(home, '.codex'), { recursive: true })
  const db = new DatabaseSync(join(home, '.codex', 'state_5.sqlite'))
  db.exec(
    `create table threads (id text primary key, rollout_path text, created_at integer, updated_at integer, source text, cwd text, title text, name text, model text, archived integer default 0${
      withAgentColumns ? ', agent_nickname text, agent_role text' : ''
    }); create table thread_spawn_edges (parent_thread_id text not null, child_thread_id text not null primary key, status text not null);`,
  )
  for (const r of rows) {
    const updated = Math.floor((NOW - (r.updatedSecondsAgo ?? 5) * 1000) / 1000)
    db.prepare(`insert into threads (id, rollout_path, created_at, updated_at, source, cwd, title${withAgentColumns ? ', agent_nickname, agent_role' : ''}) values (?, ?, ?, ?, ?, ?, ?${withAgentColumns ? ', ?, ?' : ''})`).run(
      ...[r.id, null, updated, updated, r.source, r.cwd ?? 'E:\\Work\\App', r.title ?? '', ...(withAgentColumns ? [r.agent_nickname ?? null, r.agent_role ?? null] : [])],
    )
  }
  for (const [p, c] of edges) db.prepare('insert into thread_spawn_edges values (?, ?, ?)').run(p, c, 'open')
  db.close()
  return home
}
const opts = (home: string) => ({ home, now: NOW, maxAgeMs: 7 * 86_400_000 })

describe('scanCodex: subagent threads', () => {
  it('keeps subagent threads out of the sessions and returns them as runs with the type and the parent', async () => {
    const home = fixture(
      [
        { id: 'main1', source: 'vscode', title: 'Fix cart' },
        { id: 'sub1', source: '{"subagent":{"thread_spawn":{"parent_thread_id":"main1","agent_role":"reviewer","agent_nickname":"Rex"}}}' },
        { id: 'sub2', source: '{"subagent":{"other":"guardian"}}' },
      ],
    )
    const r = await scanCodex(opts(home), new Map())
    expect(r.sessions.map((s) => s.id)).toEqual(['main1'])
    expect(r.runs.map((x) => [x.id, x.agentType, x.parentId, x.agent]).sort()).toEqual([
      ['sub1', 'reviewer', 'main1', 'codex'],
      ['sub2', 'guardian', '', 'codex'],
    ])
    expect(r.runs[0].projectPath).toBe('E:/Work/App')
  })

  it('takes the agent role of the thread table first, and the parent from the spawn table when the source does not name it', async () => {
    const home = fixture([{ id: 'sub3', source: '{"subagent":{"thread_spawn":{}}}', agent_role: 'db-architect' }], [['main9', 'sub3']])
    const { runs } = await scanCodex(opts(home), new Map())
    expect(runs[0]).toMatchObject({ agentType: 'db-architect', parentId: 'main9' })
  })

  it('says a recently active subagent thread is working, and an older one idle', async () => {
    const home = fixture([
      { id: 'a', source: '{"subagent":{"other":"x"}}', updatedSecondsAgo: 5 },
      { id: 'b', source: '{"subagent":{"other":"x"}}', updatedSecondsAgo: 3600 },
    ])
    const { runs } = await scanCodex(opts(home), new Map())
    expect(Object.fromEntries(runs.map((x) => [x.id, x.state]))).toEqual({ a: 'running', b: 'idle' })
  })

  it('still reads threads of a Codex version that has no agent columns', async () => {
    const home = fixture([{ id: 'main1', source: 'cli' }, { id: 'sub1', source: '{"subagent":{"other":"guardian"}}' }], [], false)
    const r = await scanCodex(opts(home), new Map())
    expect(r.sessions).toHaveLength(1)
    expect(r.runs[0].agentType).toBe('guardian')
  })

  it('never returns the first message or preview of a thread', async () => {
    const home = fixture([{ id: 'sub1', source: '{"subagent":{"other":"guardian"}}', title: 'SECRET TITLE' }])
    expect(JSON.stringify((await scanCodex(opts(home), new Map())).runs)).not.toMatch(/SECRET/)
  })
})
