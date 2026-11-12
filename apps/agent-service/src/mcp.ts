import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentKind, McpServer } from './model.ts'
import { asArray, asRecord, asString, projectKey, redactTarget } from './util.ts'

// MCP servers are read out of the config files the agents use. A server in a config file is "configured": whether it
// is connected right now is only known where the agent says so (Claude's needs-sign-in list). Environment values and
// header values are never kept, only the names of environment variables.

type Json = Record<string, unknown>

// ---- a small TOML reader: tables, quoted keys, strings, numbers, booleans, arrays, inline tables

function stripComment(line: string): string {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#') return line.slice(0, i)
  }
  return line
}

function splitTop(text: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

function unquote(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\(["\\ntr])/g, (_, ch: string) => ({ n: '\n', t: '\t', r: '\r' })[ch] ?? ch)
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1)
  return t
}

function tomlValue(raw: string): unknown {
  const v = raw.trim()
  if (v.startsWith('[') && v.endsWith(']')) return splitTop(v.slice(1, -1), ',').map((p) => p.trim()).filter(Boolean).map(tomlValue)
  if (v.startsWith('{') && v.endsWith('}')) {
    const out: Json = {}
    for (const pair of splitTop(v.slice(1, -1), ',')) {
      const eq = splitTop(pair, '=')
      if (eq.length >= 2) out[unquote(eq[0])] = tomlValue(eq.slice(1).join('='))
    }
    return out
  }
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return Number(v)
  return unquote(v)
}

export function parseToml(text: string): Json {
  const root: Json = {}
  let table: Json = root
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim()
    if (!line) continue
    const header = line.match(/^\[([^\[\]].*)\]$/)
    if (header) {
      table = root
      for (const key of splitTop(header[1], '.').map(unquote)) {
        const next = table[key]
        if (next && typeof next === 'object' && !Array.isArray(next)) table = next as Json
        else {
          const created: Json = {}
          table[key] = created
          table = created
        }
      }
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = unquote(line.slice(0, eq))
    let value = line.slice(eq + 1)
    // arrays and inline tables can run over several lines
    let guard = 0
    const open = () => (value.match(/[\[{]/g) ?? []).length > (value.match(/[\]}]/g) ?? []).length
    while (open() && i + 1 < lines.length && guard++ < 200) value += ' ' + stripComment(lines[++i]).trim()
    table[key] = tomlValue(value.replace(/,\s*([\]}])/g, '$1'))
  }
  return root
}

// ---- JSON with comments (VS Code files)

export function parseJsonc(text: string): unknown {
  let out = ''
  let quote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      out += c
      if (c === '\\') out += text[++i] ?? ''
      else if (c === '"') quote = false
    } else if (c === '"') {
      quote = true
      out += c
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else out += c
  }
  return JSON.parse(out.replace(/,\s*([\]}])/g, '$1'))
}

// ---- building server entries

function entry(
  agent: AgentKind,
  name: string,
  scope: 'user' | 'project',
  configFile: string,
  raw: unknown,
  needsAuth: ReadonlySet<string> = new Set(),
): McpServer {
  const r = asRecord(raw)
  const url = asString(r?.url) ?? asString(r?.httpUrl)
  const command = asString(r?.command)
  const declared = asString(r?.type)
  let transport: McpServer['transport'] = 'unknown'
  if (declared === 'sse') transport = 'sse'
  else if (declared === 'http' || declared === 'streamable-http' || (url && !command)) transport = 'http'
  else if (command || declared === 'stdio') transport = 'stdio'
  const args = asArray(r?.args).map(String)
  const target = url && transport !== 'stdio' ? redactTarget(url, []) : command ? redactTarget(command, args) : ''
  return {
    name,
    scope,
    agent,
    transport,
    target,
    envKeys: Object.keys(asRecord(r?.env) ?? {}),
    configFile,
    status: needsAuth.has(name) ? 'needs-auth' : 'configured',
    recentCalls: 0,
  }
}

export function mcpFromCodexToml(text: string, configFile: string, scope: 'user' | 'project'): McpServer[] {
  const servers = asRecord(parseToml(text).mcp_servers)
  return Object.entries(servers ?? {}).map(([name, raw]) => entry('codex', name, scope, configFile, raw))
}

export function mcpFromClaudeJson(servers: unknown, configFile: string, scope: 'user' | 'project', needsAuth: ReadonlySet<string>): McpServer[] {
  return Object.entries(asRecord(servers) ?? {}).map(([name, raw]) => entry('claude-code', name, scope, configFile, raw, needsAuth))
}

export function mcpFromVscodeJson(text: string, configFile: string, scope: 'user' | 'project'): McpServer[] {
  let parsed: unknown
  try {
    parsed = parseJsonc(text)
  } catch {
    return []
  }
  const root = asRecord(parsed)
  return Object.entries(asRecord(root?.servers) ?? asRecord(root?.mcpServers) ?? {}).map(([name, raw]) => entry('copilot', name, scope, configFile, raw))
}

// ---- reading the files on disk, re-reading only when they changed

export interface McpPaths {
  home: string
  vscodeUser: string
}

export class McpReader {
  private cache = new Map<string, { mtimeMs: number; value: unknown }>()
  private paths: McpPaths
  constructor(paths: McpPaths) {
    this.paths = paths
  }

  private read<T>(file: string, parse: (text: string) => T, fallback: T): T {
    try {
      const st = statSync(file)
      const hit = this.cache.get(file)
      if (hit && hit.mtimeMs === st.mtimeMs) return hit.value as T
      const value = parse(readFileSync(file, 'utf8'))
      this.cache.set(file, { mtimeMs: st.mtimeMs, value })
      return value
    } catch {
      return fallback
    }
  }

  /** MCP servers the agents are set up with for a project: user-level ones and the project own. */
  forProject(projectPath: string): McpServer[] {
    const { home, vscodeUser } = this.paths
    const key = projectKey(projectPath)
    const out: McpServer[] = []

    const needs = this.read(join(home, '.claude', 'mcp-needs-auth-cache.json'), (t) => new Set(Object.keys(asRecord(JSON.parse(t)) ?? {})), new Set<string>())
    const claudeJson = join(home, '.claude.json')
    const claudeDoc = this.read(claudeJson, (t) => asRecord(JSON.parse(t)), null)
    if (claudeDoc) {
      out.push(...mcpFromClaudeJson(claudeDoc.mcpServers, claudeJson, 'user', needs))
      for (const [path, value] of Object.entries(asRecord(claudeDoc.projects) ?? {})) {
        if (projectKey(path) === key) out.push(...mcpFromClaudeJson(asRecord(value)?.mcpServers, claudeJson, 'project', needs))
      }
    }
    const mcpJson = join(projectPath, '.mcp.json')
    out.push(...mcpFromClaudeJson(this.read(mcpJson, (t) => asRecord(JSON.parse(t))?.mcpServers, undefined), mcpJson, 'project', needs))

    const codexUser = join(home, '.codex', 'config.toml')
    out.push(...this.read(codexUser, (t) => mcpFromCodexToml(t, codexUser, 'user'), [] as McpServer[]))
    const codexProject = join(projectPath, '.codex', 'config.toml')
    if (existsSync(codexProject)) out.push(...this.read(codexProject, (t) => mcpFromCodexToml(t, codexProject, 'project'), [] as McpServer[]))

    const vscodeProject = join(projectPath, '.vscode', 'mcp.json')
    out.push(...this.read(vscodeProject, (t) => mcpFromVscodeJson(t, vscodeProject, 'project'), [] as McpServer[]))
    const vscodeUserFile = join(vscodeUser, 'mcp.json')
    out.push(...this.read(vscodeUserFile, (t) => mcpFromVscodeJson(t, vscodeUserFile, 'user'), [] as McpServer[]))
    return out
  }
}
