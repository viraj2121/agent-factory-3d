import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanHarness } from '../src/harness.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-'))
  const home = join(root, 'home')
  const project = join(root, 'proj')
  const put = (file: string, text = 'x') => {
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  return { home, project, put }
}

describe('scanHarness', () => {
  it('finds instruction files of every agent in the project, and skips empty ones', () => {
    const { home, project, put } = fixture()
    put(join(project, 'CLAUDE.md'))
    put(join(project, 'AGENTS.md'))
    put(join(project, '.github', 'copilot-instructions.md'))
    put(join(project, 'GEMINI.md'), '')
    put(join(home, '.codex', 'AGENTS.md'), '')
    const items = scanHarness(project, home)
    expect(items.filter((i) => i.kind === 'instructions').map((i) => [i.name, i.agent, i.scope])).toEqual([
      ['CLAUDE.md', 'claude-code', 'project'],
      ['AGENTS.md', 'codex', 'project'],
      ['copilot-instructions.md', 'copilot', 'project'],
    ])
  })

  it('finds skills (folders with SKILL.md), subagents and commands at project and user level', () => {
    const { home, project, put } = fixture()
    put(join(project, '.claude', 'skills', 'blender-hall', 'SKILL.md'))
    put(join(project, '.claude', 'skills', 'not-a-skill', 'readme.md'))
    put(join(home, '.claude', 'skills', 'caveman', 'SKILL.md'))
    put(join(project, '.claude', 'agents', '3d-ui-builder.md'))
    put(join(project, '.github', 'agents', 'reviewer.agent.md'))
    put(join(project, '.claude', 'commands', 'ship.md'))
    const items = scanHarness(project, home)
    const pick = (kind: string) => items.filter((i) => i.kind === kind).map((i) => `${i.name}:${i.scope}:${i.agent}`).sort()
    expect(pick('skill')).toEqual(['blender-hall:project:claude-code', 'caveman:user:claude-code'])
    expect(pick('subagent')).toEqual(['3d-ui-builder:project:claude-code', 'reviewer:project:copilot'])
    expect(pick('command')).toEqual(['ship:project:claude-code'])
  })

  it('finds Codex agent files and Copilot prompt files', () => {
    const { home, project, put } = fixture()
    put(join(project, '.codex', 'agents', 'api-designer.toml'))
    put(join(project, '.github', 'prompts', 'new-component.prompt.md'))
    const items = scanHarness(project, home)
    expect(items.filter((i) => i.kind === 'subagent').map((i) => `${i.name}:${i.agent}`)).toEqual(['api-designer:codex'])
    expect(items.filter((i) => i.kind === 'command').map((i) => `${i.name}:${i.agent}`)).toEqual(['new-component:copilot'])
  })

  it('lists hooks by event and enabled plugins from the settings files, without reading commands', () => {
    const { home, project, put } = fixture()
    put(join(project, '.claude', 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'SECRET-CMD' }] }], Stop: [] } }))
    put(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@market': true, 'old@market': false } }))
    const items = scanHarness(project, home)
    expect(items.filter((i) => i.kind === 'hook').map((i) => i.name)).toEqual(['PreToolUse'])
    expect(items.filter((i) => i.kind === 'plugin').map((i) => i.name)).toEqual(['superpowers@market'])
    expect(JSON.stringify(items)).not.toMatch(/SECRET-CMD/)
  })

  it('returns an empty list when nothing is there', () => {
    const { home, project } = fixture()
    expect(scanHarness(project, home)).toEqual([])
  })
})
