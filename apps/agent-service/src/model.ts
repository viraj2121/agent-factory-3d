// Shared shapes of the agent service. The dashboard has a copy of the wire types in apps/dashboard/src/live/wire.ts.

export type AgentKind = 'claude-code' | 'codex' | 'copilot' | 'other'
export type Department = 'planning' | 'development' | 'review'
export type SessionState = 'running' | 'needs-you' | 'idle' | 'ended'

/** What the last record in an agent file was, which decides whether the agent is working or waiting. */
export type LastKind = 'user-prompt' | 'tool-call' | 'tool-result' | 'turn-ended' | 'waiting-input' | 'other'

export interface PlanProgress {
  done: number
  total: number
}

export interface AgentSession {
  id: string
  agent: AgentKind
  /** Name for people, e.g. "Claude Code", or the name a hook reported for an unknown agent. */
  agentLabel: string
  source: 'files' | 'hook'
  /** Absolute folder the agent works in, normalised (see normalizePath). */
  projectPath: string
  /** Title the agent itself wrote, or null. Never the text of a message. */
  title: string | null
  model: string | null
  /** Milliseconds since epoch of the newest record. */
  lastActivityAt: number
  state: SessionState
  /** Why we think so: the state is inferred from timing and the last record, not told by the agent. */
  stateNote: string
  currentTool: string | null
  department: Department | null
  plan: PlanProgress | null
  /** Calls to MCP tools by server name, in this session. */
  mcpCalls: Record<string, number>
  toolCount: number
}

/** One run of a subagent (a helper agent a session started). Titles and tool names only, never the task text. */
export interface SubagentRun {
  id: string
  /** Id of the session that started it. */
  parentId: string
  agent: AgentKind
  /** The agent type it ran as: the name of an agent file, or a built-in type such as Explore. */
  agentType: string
  /** The short task label the parent gave it, cut to 120 characters, or null. */
  description: string | null
  projectPath: string
  model: string | null
  lastActivityAt: number
  state: SessionState
  stateNote: string
  currentTool: string | null
  department: Department | null
  mcpCalls: Record<string, number>
  toolCount: number
}

export interface McpServer {
  name: string
  /** Where it is configured: user level or the project. */
  scope: 'user' | 'project'
  agent: AgentKind
  transport: 'stdio' | 'http' | 'sse' | 'unknown'
  /** The program or URL, with secret-looking parts replaced by ***. */
  target: string
  /** Names of environment variables it gets. Values are never read out. */
  envKeys: string[]
  /** Config file it came from. */
  configFile: string
  /**
   * 'configured' = in a config file; 'needs-auth' = the agent says it needs signing in; 'seen-in-use' = not in any file we read
   * (a connector, for example) but a session called its tools. Connection state is otherwise unknown.
   */
  status: 'configured' | 'needs-auth' | 'seen-in-use'
  /** Calls seen in the project recent sessions (any agent). */
  recentCalls: number
}

export type HarnessKind = 'instructions' | 'skill' | 'subagent' | 'hook' | 'plugin' | 'command'

export interface HarnessItem {
  kind: HarnessKind
  agent: AgentKind
  name: string
  scope: 'user' | 'project'
  /** File or folder it lives in. */
  path: string
}

/** working = running, needs-you = waiting for the person, idle = ran lately and is quiet (asleep), standby = defined in a file, never seen running. */
export type RosterState = 'running' | 'needs-you' | 'idle' | 'standby'
/** How we decided the bay of an agent. Only 'activity' is something the agent did; the others are guesses and are shown as guesses. */
export type DepartmentBasis = 'activity' | 'name' | 'description' | 'tools' | 'unknown'

/** One robot: an agent that exists in the project, working or not. Never contains message text or tool inputs. */
export interface RosterEntry {
  /** Stable id: the same agent has the same id on every scan. */
  id: string
  name: string
  agent: AgentKind
  agentLabel: string
  /** 'definition' = an agent file; 'session' = a main session of an agent tool; 'subagent' = a helper agent that ran without an agent file (Explore, general-purpose...). */
  role: 'definition' | 'session' | 'subagent'
  /** For hook-reported agents 'hook', otherwise 'files'. */
  source: 'files' | 'hook'
  /** Where an agent file lives: user level (all projects) or this project. Null for sessions. */
  scope: 'user' | 'project' | null
  /** The agent file, or null for a session. */
  definedIn: string | null
  /** From the agent file, or the title a session wrote. */
  description: string | null
  model: string | null
  /** Tools the agent file lists, or null when it lists none (then it gets the tool's default tools). */
  tools: string[] | null
  department: Department
  departmentBasis: DepartmentBasis
  state: RosterState
  stateNote: string
  /** Milliseconds since epoch of the newest activity, or null when never seen running. */
  lastSeenAt: number | null
  /** The tool the agent is using right now (a name only), while it works or waits. Null otherwise. */
  currentTool: string | null
  /** Roster id of the session that started it, for a subagent whose session is still live. Otherwise null. */
  parentId: string | null
  /** How many subagent runs of it were seen in the last 7 days. */
  runs: number
  /** False for agents defined for the whole user account that never ran in this project: listed, but without a seat. */
  seated: boolean
}

/** A markdown file of a project: its place, size and date. Never its contents. */
export interface DocFile {
  /** Path inside the project folder, with forward slashes. */
  path: string
  name: string
  bytes: number
  modifiedAt: number
}

/** A markdown file of a project: its place, size and date. Never its contents. */
export interface DocFile {
  /** Path inside the project folder, with forward slashes. */
  path: string
  name: string
  bytes: number
  modifiedAt: number
}

export interface ProjectView {
  /** Stable id made from the folder. */
  id: string
  name: string
  path: string
  status: 'running' | 'needs-you' | 'idle'
  /** 0 to 1, how busy: share of sessions that are running. */
  activity: number
  /** Plan progress 0 to 1 from the agents own plans, or null when no agent wrote a plan. */
  progress: number | null
  attention: Department | null
  /** Seats used per department, 0 to 3. */
  agents: Record<Department, number>
  /** True for a folder found only by its agent setup files, with no recent session. */
  discovered: boolean
  sessions: AgentSession[]
  /** Every agent that exists here, most active first: sessions and agent files. */
  roster: RosterEntry[]
  mcp: McpServer[]
  harness: HarnessItem[]
  /** Markdown files of the project (not the files that steer agents), by folder then name. */
  docs: DocFile[]
  /** True when the project has more markdown files than the list holds. */
  docsTruncated: boolean
}

export interface AgentCapability {
  agent: AgentKind
  label: string
  found: boolean
  observe: 'supported' | 'unsupported'
  /** Start, stop or prompt the agent from the hub. */
  control: 'unsupported'
  note: string
}

export interface Snapshot {
  generatedAt: number
  version: 1
  projects: ProjectView[]
  capabilities: AgentCapability[]
}

// ---- settings (~/.ai-factory/settings.json); checked and saved by settings.ts

export interface HiddenProject {
  path: string
  /** The name it had when it was hidden, so the Settings panel can list it. */
  name: string
}

export type DisplayValue = string | number | boolean

export interface ServiceSettings {
  version: 1
  /** Days back to read sessions and subagent runs, 1 to 365. Null = the default (AGENT_SERVICE_DAYS, else 7). */
  days: number | null
  /** Extra folders to look in for projects with agent setup files (absolute paths). */
  roots: string[]
  /** Projects left out of the hub (sky and tabs). */
  hiddenProjects: HiddenProject[]
  /** Display names, keyed by the project folder (compared without case). */
  projectNames: Record<string, string>
  /** The dashboard's own display choices (quality, labels, tour...). Plain values only. */
  display: Record<string, DisplayValue>
}
