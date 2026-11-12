import { describe, expect, it } from 'vitest'
import { parseCopilotSession, reduceChatLog } from '../src/adapters/copilot.ts'

const line = (o: unknown) => JSON.stringify(o)
const initial = (extra: Record<string, unknown> = {}) =>
  line({ kind: 0, v: { version: 3, creationDate: 1_700_000_000_000, sessionId: 's1', requests: [], inputState: { selectedModel: { identifier: 'copilot/gpt-5', metadata: { name: 'GPT-5' } } }, ...extra } })
const request = (ts: number, response: unknown[] = []) => line({ kind: 2, k: ['requests'], v: [{ requestId: 'r' + ts, timestamp: ts, message: { text: 'SECRET PROMPT' }, response, modelState: { value: 0 } }] })
const tool = (toolId: string, extra: Record<string, unknown> = {}) => ({ kind: 'toolInvocationSerialized', toolId, isComplete: true, ...extra })

describe('reduceChatLog', () => {
  it('applies set and push patches to the first snapshot', () => {
    const state = reduceChatLog([initial(), line({ kind: 1, k: ['customTitle'], v: 'Refactor header' }), request(1000), line({ kind: 2, k: ['requests', 0, 'response'], v: [tool('copilot_readFile')] }), line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1, completedAt: 5000 } })].join('\n'))
    expect(state?.customTitle).toBe('Refactor header')
    const req = (state?.requests as { response: unknown[]; modelState: { value: number } }[])[0]
    expect(req.response).toHaveLength(1)
    expect(req.modelState.value).toBe(1)
  })

  it('returns null without a snapshot, and ignores patches to places that are not there', () => {
    expect(reduceChatLog('')).toBeNull()
    expect(reduceChatLog([initial(), line({ kind: 1, k: ['requests', 9, 'modelState'], v: { value: 1 } })].join('\n'))?.requests).toEqual([])
  })
})

describe('parseCopilotSession', () => {
  it('reads title, model, tools and a finished turn', () => {
    const log = [initial(), line({ kind: 1, k: ['customTitle'], v: 'Refactor header' }), request(1_700_000_002_000, [tool('copilot_readFile'), tool('run_in_terminal', { toolSpecificData: { commandLine: { original: 'npx vitest run' } } })]), line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1, completedAt: 1_700_000_009_000 } })].join('\n')
    const a = parseCopilotSession(log, 1_000)
    expect(a.title).toBe('Refactor header')
    expect(a.model).toBe('GPT-5')
    expect(a.toolCount).toBe(2)
    expect(a.currentTool).toBe('run_in_terminal')
    expect(a.currentCommand).toBe('npx vitest run')
    expect(a.lastKind).toBe('turn-ended')
    expect(a.lastActivityAt).toBe(1_700_000_009_000)
  })

  it('sees an unfinished tool call and a request that waits for you', () => {
    const pending = [initial(), request(2_000, [tool('copilot_replaceString', { isComplete: false })])].join('\n')
    expect(parseCopilotSession(pending, 1_000).lastKind).toBe('tool-call')
    const waiting = [initial(), request(2_000, [tool('run_in_terminal')]), line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 4 } })].join('\n')
    expect(parseCopilotSession(waiting, 1_000).lastKind).toBe('waiting-input')
    const justAsked = [initial(), request(2_000, [])].join('\n')
    expect(parseCopilotSession(justAsked, 1_000).lastKind).toBe('user-prompt')
  })

  it('counts MCP tools by server and never returns message text', () => {
    const log = [initial(), request(2_000, [tool('mcp_github_get_me'), tool('mcp_github_list_issues'), tool('copilot_readFile')])].join('\n')
    const a = parseCopilotSession(log, 1_000)
    expect(a.mcpCalls).toEqual({ github: 2 })
    expect(JSON.stringify(a)).not.toMatch(/SECRET/)
  })

  it('gives an empty result for a file that is not a chat log', () => {
    const a = parseCopilotSession('nonsense', 77)
    expect(a.toolCount).toBe(0)
    expect(a.lastActivityAt).toBe(77)
  })
})
