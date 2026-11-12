import { describe, expect, it } from 'vitest'
import { buildSession, emptyActivity, mcpServerOf, noteTool, type SessionContext } from '../src/adapters/common.ts'

const ctx: SessionContext = { id: 's', agent: 'codex', agentLabel: 'Codex', source: 'files', fallbackCwd: null, fileMtime: 1_000, now: 5_000 }

describe('buildSession', () => {
  it('needs a folder, from the file or from the caller, else there is no project to put it in', () => {
    expect(buildSession(emptyActivity(), ctx)).toBeNull()
    expect(buildSession(emptyActivity(), { ...ctx, fallbackCwd: '\\\\?\\E:\\Work\\App' })?.projectPath).toBe('E:/Work/App')
    expect(buildSession({ ...emptyActivity(), cwd: 'E:/A' }, { ...ctx, fallbackCwd: 'E:/B' })?.projectPath).toBe('E:/A')
  })

  it('uses the file time when the records have none', () => {
    expect(buildSession({ ...emptyActivity(), cwd: '/x' }, ctx)?.lastActivityAt).toBe(1_000)
  })

  it('cuts a long title and strips line breaks, so a thread title can never carry a whole message', () => {
    const s = buildSession({ ...emptyActivity(), cwd: '/x', title: 'a'.repeat(300) + '\nsecond line' }, ctx)
    expect(s?.title?.length).toBeLessThanOrEqual(120)
    expect(s?.title).not.toMatch(/\n/)
  })

  it('puts the session in the department of its newest tool', () => {
    const a = { ...emptyActivity(), cwd: '/x' }
    noteTool(a, 'Bash', 'git push')
    expect(buildSession(a, ctx)?.department).toBe('development')
  })
})

describe('mcpServerOf', () => {
  it('reads the server out of an MCP tool name, and nothing out of other tools', () => {
    expect(mcpServerOf('mcp__github__create_issue')).toBe('github')
    expect(mcpServerOf('mcp__claude_ai_Gmail__search')).toBe('claude_ai_Gmail')
    expect(mcpServerOf('Read')).toBeNull()
    expect(mcpServerOf('mcp__')).toBeNull()
  })
})
