import { departmentFor } from '../department.ts'
import type { AgentKind, AgentSession, LastKind, PlanProgress, SubagentRun } from '../model.ts'
import { inferState, inferSubagentState } from '../status.ts'
import { cleanPath } from '../util.ts'

/** What an adapter reads out of one agent file. No message text: only titles the agent wrote, tool names and counts. */
export interface Activity {
  cwd: string | null
  title: string | null
  model: string | null
  lastActivityAt: number
  lastKind: LastKind
  currentTool: string | null
  currentCommand: string | null
  plan: PlanProgress | null
  mcpCalls: Record<string, number>
  toolCount: number
}

export const emptyActivity = (): Activity => ({
  cwd: null,
  title: null,
  model: null,
  lastActivityAt: Number.NaN,
  lastKind: 'other',
  currentTool: null,
  currentCommand: null,
  plan: null,
  mcpCalls: {},
  toolCount: 0,
})

/** The server name in an MCP tool name such as `mcp__github__create_issue`, or null for any other tool. */
export function mcpServerOf(tool: string): string | null {
  if (!tool.startsWith('mcp__')) return null
  const parts = tool.split('__')
  return parts.length >= 3 && parts[1] ? parts[1] : null
}

export function noteTool(a: Activity, tool: string, command: string | null): void {
  a.toolCount++
  a.currentTool = tool
  a.currentCommand = command
  const server = mcpServerOf(tool)
  if (server) a.mcpCalls[server] = (a.mcpCalls[server] ?? 0) + 1
}

/** One line of at most 120 characters, so even a thread named after a whole message shows only its start. */
export function tidyTitle(title: string | null): string | null {
  if (!title) return null
  const line = title.replace(/\s+/g, ' ').trim()
  if (!line) return null
  return line.length > 120 ? line.slice(0, 117) + '...' : line
}

export interface SessionContext {
  id: string
  agent: AgentKind
  agentLabel: string
  source: 'files' | 'hook'
  /** Used when the file itself does not say which folder the agent works in. */
  fallbackCwd: string | null
  /** Used when the file has no time at all. */
  fileMtime: number
  now: number
}

/** Turns what was read from a file into a session, or null when the folder is unknown (it cannot belong to a project then). */
export function buildSession(a: Activity, ctx: SessionContext): AgentSession | null {
  const cwd = a.cwd ?? ctx.fallbackCwd
  if (!cwd) return null
  const lastActivityAt = Number.isFinite(a.lastActivityAt) ? a.lastActivityAt : ctx.fileMtime
  const { state, note } = inferState({ now: ctx.now, lastActivityAt, lastKind: a.lastKind })
  return {
    id: ctx.id,
    agent: ctx.agent,
    agentLabel: ctx.agentLabel,
    source: ctx.source,
    projectPath: cleanPath(cwd),
    title: tidyTitle(a.title),
    model: a.model,
    lastActivityAt,
    state,
    stateNote: note,
    currentTool: a.currentTool,
    department: a.currentTool ? departmentFor(a.currentTool, a.currentCommand ?? undefined) : null,
    plan: a.plan,
    mcpCalls: a.mcpCalls,
    toolCount: a.toolCount,
  }
}

export interface RunContext {
  id: string
  parentId: string
  agent: AgentKind
  agentType: string
  description: string | null
  /** Used when the file itself does not say which folder the agent works in (the parent session's folder). */
  fallbackCwd: string | null
  fileMtime: number
  now: number
}

/** Turns what was read from a subagent file into a run, or null when its folder is unknown. */
export function buildRun(a: Activity, ctx: RunContext): SubagentRun | null {
  const cwd = a.cwd ?? ctx.fallbackCwd
  if (!cwd) return null
  const lastActivityAt = Number.isFinite(a.lastActivityAt) ? a.lastActivityAt : ctx.fileMtime
  const { state, note } = inferSubagentState({ now: ctx.now, lastActivityAt, lastKind: a.lastKind })
  return {
    id: ctx.id,
    parentId: ctx.parentId,
    agent: ctx.agent,
    agentType: ctx.agentType,
    description: tidyTitle(ctx.description),
    projectPath: cleanPath(cwd),
    model: a.model,
    lastActivityAt,
    state,
    stateNote: note,
    currentTool: a.currentTool,
    department: a.currentTool ? departmentFor(a.currentTool, a.currentCommand ?? undefined) : null,
    mcpCalls: a.mcpCalls,
    toolCount: a.toolCount,
  }
}
