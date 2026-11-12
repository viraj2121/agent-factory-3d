import { describe, expect, it } from 'vitest'
import { parseCodexRollout } from '../src/adapters/codex.ts'

const line = (o: unknown) => JSON.stringify(o)
const t = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString()
const ms = (s: number) => 1_700_000_000_000 + s * 1000

const meta = (cwd = '\\\\?\\E:\\Work\\Site') => line({ timestamp: t(0), type: 'session_meta', payload: { cwd, id: 'abc' } })
const started = (s: number) => line({ timestamp: t(s), type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } })
const complete = (s: number) => line({ timestamp: t(s), type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1', last_agent_message: 'SECRET ANSWER' } })
const call = (s: number, name: string, args: unknown) => line({ timestamp: t(s), type: 'response_item', payload: { type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'c' + s } })
const output = (s: number) => line({ timestamp: t(s), type: 'response_item', payload: { type: 'function_call_output', call_id: 'c', output: 'SECRET OUTPUT' } })
const userMsg = (s: number) => line({ timestamp: t(s), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'SECRET PROMPT' }] } })

describe('parseCodexRollout', () => {
  it('reads the folder (without the Windows long-path prefix, which cleanPath removes later) and the newest time', () => {
    const a = parseCodexRollout([meta(), started(1), call(2, 'shell_command', { command: 'ls' }), output(3)].join('\n'))
    expect(a.cwd).toBe('\\\\?\\E:\\Work\\Site')
    expect(a.lastActivityAt).toBe(ms(3))
  })

  it('knows the last kind: tool call, tool output, finished turn, started turn, new prompt', () => {
    expect(parseCodexRollout([started(1), call(2, 'shell_command', { command: 'ls' })].join('\n')).lastKind).toBe('tool-call')
    expect(parseCodexRollout([started(1), call(2, 'shell_command', { command: 'ls' }), output(3)].join('\n')).lastKind).toBe('tool-result')
    expect(parseCodexRollout([started(1), call(2, 'shell_command', { command: 'ls' }), output(3), complete(4)].join('\n')).lastKind).toBe('turn-ended')
    expect(parseCodexRollout([complete(1), started(2)].join('\n')).lastKind).toBe('user-prompt')
    expect(parseCodexRollout([complete(1), userMsg(2)].join('\n')).lastKind).toBe('user-prompt')
  })

  it('reads the shell command, as text or as a list', () => {
    expect(parseCodexRollout(call(1, 'shell_command', { command: 'npx vitest run' })).currentCommand).toBe('npx vitest run')
    expect(parseCodexRollout(call(1, 'shell', { command: ['powershell.exe', '-Command', 'git commit -am x'] })).currentCommand).toBe('powershell.exe -Command git commit -am x')
  })

  it('reads plan progress from update_plan', () => {
    const plan = (...s: string[]) => ({ plan: s.map((status, i) => ({ step: 'step ' + i, status })) })
    const a = parseCodexRollout([call(1, 'update_plan', plan('in_progress', 'pending', 'pending')), call(2, 'update_plan', plan('completed', 'completed', 'in_progress'))].join('\n'))
    expect(a.plan).toEqual({ done: 2, total: 3 })
  })

  it('counts MCP calls per server and tools in total', () => {
    const a = parseCodexRollout([call(1, 'mcp__github__list_issues', {}), call(2, 'mcp__github__get_issue', {}), call(3, 'shell_command', { command: 'ls' })].join('\n'))
    expect(a.mcpCalls).toEqual({ github: 2 })
    expect(a.toolCount).toBe(3)
  })

  it('also understands custom tool calls such as apply_patch', () => {
    const a = parseCodexRollout(line({ timestamp: t(1), type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch', call_id: 'p' } }))
    expect(a.currentTool).toBe('apply_patch')
    expect(a.lastKind).toBe('tool-call')
  })

  it('skips broken lines and never returns message or output text', () => {
    const a = parseCodexRollout(['oops', meta(), userMsg(1), call(2, 'shell_command', { command: 'ls' }), output(3), complete(4), '{"time'].join('\n'))
    expect(JSON.stringify(a)).not.toMatch(/SECRET/)
  })
})
