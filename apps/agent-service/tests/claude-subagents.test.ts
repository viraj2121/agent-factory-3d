import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanClaude } from '../src/adapters/claude.ts'

const T0 = 1_700_000_000_000
const t = (s: number) => new Date(T0 + s * 1000).toISOString()
const line = (o: unknown) => JSON.stringify(o)
const prompt = (s: number, cwd = 'E:\\Work\\App') => line({ type: 'user', timestamp: t(s), cwd, message: { role: 'user', content: [{ type: 'text', text: 'SECRET PROMPT' }] } })
const toolCall = (s: number, name: string) =>
  line({ type: 'assistant', timestamp: t(s), message: { model: 'claude-sonnet-5-5', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x' + s, name, input: { command: 'SECRET' } }] } })
const finalText = (s: number) => line({ type: 'assistant', timestamp: t(s), message: { model: 'claude-sonnet-5-5', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'SECRET ANSWER' }] } })

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'claude-sub-'))
  const dir = join(home, '.claude', 'projects', 'e--Work-App')
  mkdirSync(dir, { recursive: true })
  const session = (id: string, lines: string[]) => writeFileSync(join(dir, id + '.jsonl'), lines.join('\n'))
  const run = (sessionId: string, agentId: string, meta: unknown, lines: string[]) => {
    const sub = join(dir, sessionId, 'subagents')
    mkdirSync(sub, { recursive: true })
    if (meta !== null) writeFileSync(join(sub, `agent-${agentId}.meta.json`), JSON.stringify(meta))
    writeFileSync(join(sub, `agent-${agentId}.jsonl`), lines.join('\n'))
  }
  return { home, session, run }
}
const opts = (home: string, nowSeconds: number) => ({ home, now: T0 + nowSeconds * 1000, maxAgeMs: 7 * 86_400_000 })
const noCache = () => ({ cache: new Map(), runs: new Map() })

describe('scanClaude: subagent runs', () => {
  it('reads each run of a session: agent type, task label, state, newest tool, folder of the parent', () => {
    const { home, session, run } = fixture()
    session('sess1', [prompt(0), toolCall(1, 'Task')])
    run('sess1', 'aaa', { agentType: 'backend-dev', description: 'Add the cart endpoint', toolUseId: 'x1', spawnDepth: 1 }, [prompt(2), toolCall(30, 'Edit')])
    const c = noCache()
    const { runs } = scanClaude(opts(home, 40), c.cache, c.runs)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      id: 'aaa',
      parentId: 'sess1',
      agent: 'claude-code',
      agentType: 'backend-dev',
      description: 'Add the cart endpoint',
      projectPath: 'E:/Work/App',
      state: 'running',
      currentTool: 'Edit',
      department: 'development',
    })
  })

  it('says a finished run is idle (done), not waiting for a person', () => {
    const { home, session, run } = fixture()
    session('sess1', [prompt(0), toolCall(1, 'Task')])
    run('sess1', 'bbb', { agentType: 'Explore', description: 'Look around' }, [prompt(2), toolCall(10, 'Read'), finalText(20)])
    const c = noCache()
    const { runs } = scanClaude(opts(home, 30), c.cache, c.runs)
    expect(runs[0]).toMatchObject({ agentType: 'Explore', state: 'idle' })
    expect(runs[0].stateNote).toMatch(/finished/)
  })

  it('uses a placeholder type when the meta file is missing, and skips runs older than the age limit', () => {
    const { home, session, run } = fixture()
    session('sess1', [prompt(0), toolCall(1, 'Task')])
    run('sess1', 'ccc', null, [prompt(2), toolCall(3, 'Read')])
    run('sess1', 'old', { agentType: 'x' }, [prompt(2), toolCall(3, 'Read')])
    const longAgo = new Date(Date.now() - 30 * 86_400_000)
    utimesSync(join(home, '.claude', 'projects', 'e--Work-App', 'sess1', 'subagents', 'agent-old.jsonl'), longAgo, longAgo)
    const c = noCache()
    const { runs } = scanClaude({ home, now: Date.now(), maxAgeMs: 7 * 86_400_000 }, c.cache, c.runs)
    expect(runs.map((r) => r.id)).toEqual(['ccc'])
    expect(runs[0].agentType).toBe('subagent')
  })

  it('shows its parent as working, not waiting for you, while a subagent of it is working', () => {
    const { home, session, run } = fixture()
    session('sess1', [prompt(0), toolCall(1, 'Task')]) // a tool call with no result for 100 s would read as "waiting for you"
    run('sess1', 'ddd', { agentType: 'planner' }, [prompt(2), toolCall(95, 'Read')])
    const c = noCache()
    const alone = scanClaude(opts(home, 100), c.cache, c.runs)
    expect(alone.sessions[0].state).toBe('running')
    expect(alone.sessions[0].stateNote).toMatch(/subagent/)

    const { home: h2, session: s2 } = fixture()
    s2('sess1', [prompt(0), toolCall(1, 'Task')])
    const c2 = noCache()
    expect(scanClaude(opts(h2, 100), c2.cache, c2.runs).sessions[0].state).toBe('needs-you')
  })

  it('never returns prompt text or tool input from a run', () => {
    const { home, session, run } = fixture()
    session('sess1', [prompt(0)])
    run('sess1', 'eee', { agentType: 'x' }, [prompt(1), toolCall(2, 'Bash')])
    const c = noCache()
    expect(JSON.stringify(scanClaude(opts(home, 5), c.cache, c.runs).runs)).not.toMatch(/SECRET/)
  })

  it('re-reads a run only when its file changed', () => {
    const { home, session, run } = fixture()
    session('sess1', [prompt(0)])
    run('sess1', 'fff', { agentType: 'x' }, [prompt(1), toolCall(2, 'Read')])
    const c = noCache()
    scanClaude(opts(home, 5), c.cache, c.runs)
    expect(c.runs.size).toBe(1)
    scanClaude(opts(home, 6), c.cache, c.runs)
    expect(c.runs.size).toBe(1)
  })
})
