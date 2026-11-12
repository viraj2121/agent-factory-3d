import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentKind, HarnessItem, HarnessKind } from './model.ts'
import { asRecord } from './util.ts'

// The "harness" of a project: the files that steer an agent besides the prompt, i.e. instruction files, skills,
// subagents, slash commands, hooks and plugins. Only names and places are listed; hook commands are not read out.

const nonEmpty = (file: string): boolean => {
  try {
    return statSync(file).isFile() && statSync(file).size > 0
  } catch {
    return false
  }
}

const listDir = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return asRecord(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

export function scanHarness(projectPath: string, home: string): HarnessItem[] {
  const items: HarnessItem[] = []
  const add = (kind: HarnessKind, agent: AgentKind, name: string, scope: 'user' | 'project', path: string) => items.push({ kind, agent, name, scope, path })

  const instructions: [string, AgentKind, string][] = [
    [join(projectPath, 'CLAUDE.md'), 'claude-code', 'CLAUDE.md'],
    [join(projectPath, 'AGENTS.md'), 'codex', 'AGENTS.md'],
    [join(projectPath, '.github', 'copilot-instructions.md'), 'copilot', 'copilot-instructions.md'],
    [join(projectPath, 'GEMINI.md'), 'other', 'GEMINI.md'],
    [join(projectPath, '.cursorrules'), 'other', '.cursorrules'],
  ]
  for (const [path, agent, name] of instructions) if (nonEmpty(path)) add('instructions', agent, name, 'project', path)
  for (const file of listDir(join(projectPath, '.github', 'instructions')).filter((f) => f.endsWith('.instructions.md')))
    add('instructions', 'copilot', file, 'project', join(projectPath, '.github', 'instructions', file))
  const userInstructions: [string, AgentKind, string][] = [
    [join(home, '.claude', 'CLAUDE.md'), 'claude-code', 'CLAUDE.md'],
    [join(home, '.codex', 'AGENTS.md'), 'codex', 'AGENTS.md'],
  ]
  for (const [path, agent, name] of userInstructions) if (nonEmpty(path)) add('instructions', agent, name, 'user', path)

  const skillRoots: [string, AgentKind, 'user' | 'project'][] = [
    [join(projectPath, '.claude', 'skills'), 'claude-code', 'project'],
    [join(home, '.claude', 'skills'), 'claude-code', 'user'],
    [join(projectPath, '.codex', 'skills'), 'codex', 'project'],
    [join(home, '.codex', 'skills'), 'codex', 'user'],
    [join(projectPath, '.agents', 'skills'), 'other', 'project'],
    [join(projectPath, '.github', 'skills'), 'copilot', 'project'],
  ]
  for (const [root, agent, scope] of skillRoots)
    for (const dir of listDir(root)) if (existsSync(join(root, dir, 'SKILL.md'))) add('skill', agent, dir, scope, join(root, dir))

  const mdRoots: [string, AgentKind, 'user' | 'project', HarnessKind, string][] = [
    [join(projectPath, '.claude', 'agents'), 'claude-code', 'project', 'subagent', '.md'],
    [join(home, '.claude', 'agents'), 'claude-code', 'user', 'subagent', '.md'],
    [join(projectPath, '.github', 'agents'), 'copilot', 'project', 'subagent', '.agent.md'],
    [join(projectPath, '.codex', 'agents'), 'codex', 'project', 'subagent', '.toml'],
    [join(projectPath, '.github', 'prompts'), 'copilot', 'project', 'command', '.prompt.md'],
    [join(projectPath, '.claude', 'commands'), 'claude-code', 'project', 'command', '.md'],
    [join(home, '.claude', 'commands'), 'claude-code', 'user', 'command', '.md'],
  ]
  for (const [root, agent, scope, kind, ext] of mdRoots)
    for (const file of listDir(root).filter((f) => f.endsWith(ext))) add(kind, agent, file.slice(0, -ext.length), scope, join(root, file))

  const settingsFiles: [string, 'user' | 'project'][] = [
    [join(projectPath, '.claude', 'settings.json'), 'project'],
    [join(projectPath, '.claude', 'settings.local.json'), 'project'],
    [join(home, '.claude', 'settings.json'), 'user'],
  ]
  for (const [file, scope] of settingsFiles) {
    const doc = readJson(file)
    if (!doc) continue
    for (const [event, value] of Object.entries(asRecord(doc.hooks) ?? {})) {
      if (Array.isArray(value) && value.length > 0) add('hook', 'claude-code', event, scope, file)
    }
    for (const [plugin, enabled] of Object.entries(asRecord(doc.enabledPlugins) ?? {})) if (enabled === true) add('plugin', 'claude-code', plugin, scope, file)
  }
  return items
}
