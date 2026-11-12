import { scanClaude, type FileCache, type RunInfo } from './adapters/claude.ts'
import type { Activity } from './adapters/common.ts'
import { scanCodex } from './adapters/codex.ts'
import { scanCopilot } from './adapters/copilot.ts'
import { HookStore } from './adapters/hooks.ts'
import { discoverProjects, scanRootsFrom, type Discovered } from './discover.ts'
import { scanHarness } from './harness.ts'
import { scanDocs, type DocsResult } from './docs.ts'
import { McpReader } from './mcp.ts'
import type { AgentCapability, AgentSession, HarnessItem, Snapshot } from './model.ts'
import { buildProjects } from './projects.ts'
import { DEFAULT_SETTINGS, type ServiceSettings } from './settings.ts'
import { scanAgentDefinitions, type AgentDefinition } from './roster.ts'
import { projectKey } from './util.ts'

export interface ScannerOptions {
  home: string
  vscodeUser: string
  /** Sessions older than this are not looked at. */
  maxAgeMs?: number
  now?: () => number
  /** Folders to look in for agent setup files, separated by `;` (AGENT_SERVICE_ROOTS). Default: next to folders where agents were used. */
  roots?: string
  /** The saved settings (days, extra folders, hidden projects, names). Read on every scan. */
  settings?: () => ServiceSettings
}

const HARNESS_TTL_MS = 30_000
const DISCOVERY_EVERY_MS = 5 * 60_000

export class Scanner {
  readonly hooks = new HookStore()
  private claudeCache: FileCache<Activity> = new Map()
  private claudeRunCache: FileCache<RunInfo> = new Map()
  private codexCache: FileCache<Activity> = new Map()
  private copilotCache: FileCache<Activity> = new Map()
  private mcp: McpReader
  private docsCache = new Map<string, { at: number; result: DocsResult }>()
  private harnessCache = new Map<string, { at: number; items: HarnessItem[] }>()
  private definitionCache = new Map<string, { at: number; items: AgentDefinition[] }>()
  private opts: Required<ScannerOptions>
  private discovered: Discovered[] = []
  private discoveredAt = 0
  private discovering = false
  private lastRoots = ''

  constructor(opts: ScannerOptions) {
    this.opts = { maxAgeMs: 7 * 24 * 3600 * 1000, now: Date.now, roots: '', settings: () => DEFAULT_SETTINGS, ...opts }
    this.mcp = new McpReader({ home: opts.home, vscodeUser: opts.vscodeUser })
  }

  /** Days back that are read: the saved setting, else the start-up default. */
  effectiveDays(): number {
    return this.opts.settings().days ?? Math.round(this.opts.maxAgeMs / (24 * 3600 * 1000))
  }

  async scan(): Promise<Snapshot> {
    const { home, vscodeUser } = this.opts
    const settings = this.opts.settings()
    const maxAgeMs = this.effectiveDays() * 24 * 3600 * 1000
    const now = this.opts.now()
    const common = { now, maxAgeMs }
    const claude = scanClaude({ home, ...common }, this.claudeCache, this.claudeRunCache)
    const codex = await scanCodex({ home, ...common }, this.codexCache)
    const copilot = scanCopilot({ home, vscodeUser, ...common }, this.copilotCache)
    const hooked = this.hooks.sessions(now)
    const sessions: AgentSession[] = [...claude.sessions, ...codex.sessions, ...copilot.sessions, ...hooked]

    this.refreshDiscovery(sessions, now, settings.roots)
    const projects = buildProjects(sessions, {
      now,
      discovered: this.discovered,
      hidden: new Set(settings.hiddenProjects.map((h) => projectKey(h.path))),
      names: settings.projectNames,
      runs: [...claude.runs, ...codex.runs],
      mcpFor: (path) => this.mcp.forProject(path),
      harnessFor: (path) => this.harness(path, now),
      docsFor: (path) => this.docs(path, now),
      definitionsFor: (path) => this.definitions(path, now),
    })

    const capabilities: AgentCapability[] = [
      {
        agent: 'claude-code',
        label: 'Claude Code',
        found: claude.found,
        observe: claude.found ? 'supported' : 'unsupported',
        control: 'unsupported',
        note: claude.found
          ? 'Reads the session transcripts in ~/.claude/projects. Working or waiting is inferred from timing. Starting, stopping or prompting Claude Code from the hub is not supported.'
          : 'Claude Code was not found on this computer (no ~/.claude/projects).',
      },
      {
        agent: 'codex',
        label: 'Codex',
        found: codex.found,
        observe: codex.found && !codex.note ? 'supported' : 'unsupported',
        control: 'unsupported',
        note: codex.note ?? (codex.found ? 'Reads the thread list in ~/.codex/state_5.sqlite and each session file, subagent threads included (their record format is checked only for the built-in guardian reviewer). Control from the hub is not supported.' : 'Codex was not found on this computer (no ~/.codex).'),
      },
      {
        agent: 'copilot',
        label: 'GitHub Copilot',
        found: copilot.found || copilot.cliFound,
        observe: copilot.found ? 'supported' : 'unsupported',
        control: 'unsupported',
        note: copilot.found
          ? 'Reads Copilot Chat sessions saved by VS Code. Copilot CLI sessions and Copilot subagent runs are not read yet. Control from the hub is not supported.'
          : copilot.cliFound
            ? 'Only Copilot CLI was found, and its sessions are not read yet.'
            : 'No Copilot Chat sessions were found in VS Code.',
      },
      {
        agent: 'other',
        label: 'Other agents',
        found: hooked.length > 0,
        observe: 'supported',
        control: 'unsupported',
        note: 'Any agent that can run a command on events can report with POST /api/hook (bearer token in ~/.ai-factory/token). Sessions reported this way are labelled "reported by hook".',
      },
    ]
    return { generatedAt: now, version: 1, projects, capabilities }
  }

  /** Looks for setup-only folders in the background, at most every five minutes; scans never wait for it. */
  private refreshDiscovery(sessions: AgentSession[], now: number, extraRoots: string[]): void {
    const rootText = [this.opts.roots, ...extraRoots].filter(Boolean).join(';')
    // new folders in the settings: look again now instead of waiting five minutes
    if (rootText !== this.lastRoots && !this.discovering) {
      this.lastRoots = rootText
      this.discoveredAt = 0
    }
    if (this.discovering || now - this.discoveredAt < DISCOVERY_EVERY_MS) return
    const roots = scanRootsFrom(rootText, [...new Set(sessions.map((s) => s.projectPath))])
    if (roots.length === 0) return
    this.discovering = true
    this.discoveredAt = now
    void discoverProjects(roots, { exclude: new Set([projectKey(this.opts.home)]) })
      .then((found) => {
        this.discovered = found
      })
      .catch(() => {})
      .finally(() => {
        this.discovering = false
      })
  }

  private definitions(path: string, now: number): AgentDefinition[] {
    const hit = this.definitionCache.get(path)
    if (hit && now - hit.at < HARNESS_TTL_MS) return hit.items
    const items = scanAgentDefinitions(path, this.opts.home)
    this.definitionCache.set(path, { at: now, items })
    return items
  }

  private docs(path: string, now: number): DocsResult {
    const hit = this.docsCache.get(path)
    if (hit && now - hit.at < 60_000) return hit.result
    const result = scanDocs(path)
    this.docsCache.set(path, { at: now, result })
    return result
  }

  private harness(path: string, now: number): HarnessItem[] {
    const hit = this.harnessCache.get(path)
    if (hit && now - hit.at < HARNESS_TTL_MS) return hit.items
    const items = scanHarness(path, this.opts.home)
    this.harnessCache.set(path, { at: now, items })
    return items
  }
}

/** The part of a snapshot that changes when something happened (not the time it was made). */
export function fingerprint(s: Snapshot): string {
  return JSON.stringify({ ...s, generatedAt: 0 })
}
