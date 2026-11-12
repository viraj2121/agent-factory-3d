import { describe, expect, it } from 'vitest'
import { parseClaudeTranscript } from '../src/adapters/claude.ts'

const line = (o: unknown) => JSON.stringify(o)
const t = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString()
const ms = (s: number) => 1_700_000_000_000 + s * 1000

const prompt = (s: number, cwd = 'E:\\Work\\App') => line({ type: 'user', timestamp: t(s), cwd, message: { role: 'user', content: [{ type: 'text', text: 'SECRET PROMPT TEXT' }] } })
const toolCall = (s: number, name: string, input: unknown = {}) =>
  line({ type: 'assistant', timestamp: t(s), message: { model: 'claude-sonnet-5-5', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x' + s, name, input }] } })
const toolResult = (s: number) => line({ type: 'user', timestamp: t(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'SECRET OUTPUT' }] } })
const finalText = (s: number) => line({ type: 'assistant', timestamp: t(s), message: { model: 'claude-sonnet-5-5', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'SECRET ANSWER' }] } })

describe('parseClaudeTranscript', () => {
  it('reads the folder, model, title and the newest time', () => {
    const a = parseClaudeTranscript([prompt(0), line({ type: 'ai-title', aiTitle: 'Fix the login bug' }), toolCall(5, 'Read'), toolResult(6)].join('\n'))
    expect(a.cwd).toBe('E:\\Work\\App')
    expect(a.model).toBe('claude-sonnet-5-5')
    expect(a.title).toBe('Fix the login bug')
    expect(a.lastActivityAt).toBe(ms(6))
  })

  it('takes the folder the session started in, not a folder a command later changed into', () => {
    const a = parseClaudeTranscript([prompt(0, 'E:/Work/App'), prompt(1, 'E:/Work/App/packages/web')].join('\n'))
    expect(a.cwd).toBe('E:/Work/App')
  })

  it('knows the last kind: tool call, tool result, finished turn, new prompt', () => {
    expect(parseClaudeTranscript([prompt(0), toolCall(1, 'Edit')].join('\n')).lastKind).toBe('tool-call')
    expect(parseClaudeTranscript([prompt(0), toolCall(1, 'Edit'), toolResult(2)].join('\n')).lastKind).toBe('tool-result')
    expect(parseClaudeTranscript([prompt(0), toolCall(1, 'Edit'), toolResult(2), finalText(3)].join('\n')).lastKind).toBe('turn-ended')
    expect(parseClaudeTranscript([finalText(3), prompt(9)].join('\n')).lastKind).toBe('user-prompt')
  })

  it('remembers the newest tool and the shell command it ran', () => {
    const a = parseClaudeTranscript([prompt(0), toolCall(1, 'Read'), toolResult(2), toolCall(3, 'Bash', { command: 'npx vitest run' })].join('\n'))
    expect(a.currentTool).toBe('Bash')
    expect(a.currentCommand).toBe('npx vitest run')
    expect(a.toolCount).toBe(2)
  })

  it('counts calls per MCP server', () => {
    const a = parseClaudeTranscript([toolCall(1, 'mcp__blender__get_scene_info'), toolCall(2, 'mcp__blender__look'), toolCall(3, 'mcp__github__create_issue'), toolCall(4, 'Read')].join('\n'))
    expect(a.mcpCalls).toEqual({ blender: 2, github: 1 })
  })

  it('reads plan progress from the latest todo list', () => {
    const todos = (...s: string[]) => ({ todos: s.map((status) => ({ content: 'x', status, activeForm: 'x' })) })
    const a = parseClaudeTranscript([toolCall(1, 'TodoWrite', todos('pending', 'pending', 'pending')), toolCall(2, 'TodoWrite', todos('completed', 'completed', 'in_progress', 'pending'))].join('\n'))
    expect(a.plan).toEqual({ done: 2, total: 4 })
    expect(parseClaudeTranscript(toolCall(1, 'Read')).plan).toBeNull()
  })

  it('skips broken lines and never returns message or output text', () => {
    const a = parseClaudeTranscript(['{not json', prompt(0), toolCall(1, 'Read'), toolResult(2), finalText(3), '{"type":"assis'].join('\n'))
    expect(a.lastKind).toBe('turn-ended')
    expect(JSON.stringify(a)).not.toMatch(/SECRET/)
  })

  it('does not take a meta prompt or a tool-less thinking record as activity of the user', () => {
    const meta = line({ type: 'user', isMeta: true, timestamp: t(50), message: { role: 'user', content: 'caveat' } })
    const a = parseClaudeTranscript([finalText(3), meta].join('\n'))
    expect(a.lastKind).toBe('turn-ended')
  })

  it('gives an empty result for an empty file', () => {
    const a = parseClaudeTranscript('')
    expect(a.cwd).toBeNull()
    expect(Number.isNaN(a.lastActivityAt)).toBe(true)
  })
})
