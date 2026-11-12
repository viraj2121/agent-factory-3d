import { describe, expect, it } from 'vitest'
import { departmentFor } from '../src/department.ts'

describe('departmentFor', () => {
  it('puts reading, searching and planning tools in Planning', () => {
    for (const t of ['Read', 'Grep', 'Glob', 'WebSearch', 'TodoWrite', 'ExitPlanMode', 'update_plan', 'AskUserQuestion'])
      expect(departmentFor(t)).toBe('planning')
  })

  it('puts editing tools and plain shell commands in Development', () => {
    for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch']) expect(departmentFor(t)).toBe('development')
    expect(departmentFor('Bash', 'npm install left-pad')).toBe('development')
    expect(departmentFor('shell_command', 'ls -la')).toBe('development')
  })

  it('puts test, lint and type-check commands in Review & QA', () => {
    for (const c of ['npx vitest run', 'npm test', 'npm run test:unit', 'pytest -q', 'tsc -b', 'npx oxlint', 'cargo test', 'go test ./...', 'git diff HEAD~1'])
      expect(departmentFor('Bash', c)).toBe('review')
  })

  it('puts git commit, push, pull requests and deploys in Development (shipping is development work), ahead of review', () => {
    for (const c of ['git commit -m x', 'git push origin main', 'gh pr create --fill', 'npm publish', 'docker build .', 'npm test && git push'])
      expect(departmentFor('Bash', c)).toBe('development')
  })

  it('reads the command of a Codex shell call given through a PowerShell wrapper', () => {
    expect(departmentFor('shell', 'powershell.exe -Command "git commit -am wip"')).toBe('development')
    expect(departmentFor('shell_command', 'pwsh -c "vitest run"')).toBe('review')
  })

  it('treats MCP tools by what the server is', () => {
    expect(departmentFor('mcp__github__create_pull_request')).toBe('development')
    expect(departmentFor('mcp__blender__execute_blender_code')).toBe('development')
    expect(departmentFor('mcp__claude-artifacts__publish_version')).toBe('development')
  })

  it('understands Copilot tool ids', () => {
    expect(departmentFor('copilot_readFile')).toBe('planning')
    expect(departmentFor('copilot_findTextInFiles')).toBe('planning')
    expect(departmentFor('copilot_replaceString')).toBe('development')
    expect(departmentFor('run_in_terminal', 'pytest -q')).toBe('review')
  })

  it('has a sensible default for tools it does not know and for review-like names', () => {
    expect(departmentFor('SomethingNew')).toBe('development')
    expect(departmentFor('code-review')).toBe('review')
    expect(departmentFor('')).toBe('development')
  })
})
