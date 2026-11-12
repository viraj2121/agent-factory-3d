import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanDocs, MAX_DOCS } from '../src/docs.ts'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'docs-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const put = (rel: string, text = '# x\n', at?: number) => {
  const file = join(dir, ...rel.split('/'))
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
  if (at) utimesSync(file, at / 1000, at / 1000)
}
const names = () => scanDocs(dir).files.map((f) => f.path)

describe('scanDocs', () => {
  it('lists markdown files with a relative path, size and date, and nothing else', () => {
    put('README.md', 'hello', 1_700_000_000_000)
    put('docs/guide.md')
    put('notes.txt')
    const r = scanDocs(dir)
    expect(r.files.map((f) => f.path).sort()).toEqual(['README.md', 'docs/guide.md'])
    const readme = r.files.find((f) => f.path === 'README.md')!
    expect(readme).toMatchObject({ name: 'README.md', bytes: 5, modifiedAt: 1_700_000_000_000 })
    expect(Object.keys(readme).sort()).toEqual(['bytes', 'modifiedAt', 'name', 'path'])
  })

  it('also finds .markdown and .mdx, in any letter case', () => {
    put('a.MD'); put('b.markdown'); put('c.mdx')
    expect(names().sort()).toEqual(['a.MD', 'b.markdown', 'c.mdx'])
  })

  it('leaves out the files that steer agents: instructions, skills, agent files and slash commands', () => {
    put('CLAUDE.md'); put('AGENTS.md'); put('.github/copilot-instructions.md')
    put('.claude/agents/reviewer.md'); put('.claude/skills/x/SKILL.md'); put('.claude/commands/go.md')
    put('.codex/notes.md'); put('.github/agents/a.md'); put('skills/y/SKILL.md'); put('SKILL.md')
    put('keep.md')
    expect(names()).toEqual(['keep.md'])
  })

  it('skips dependency, build and hidden folders', () => {
    put('node_modules/pkg/README.md'); put('dist/out.md'); put('.git/x.md'); put('.venv/lib/y.md'); put('build/z.md'); put('.hidden/h.md')
    put('src/ok.md')
    expect(names()).toEqual(['src/ok.md'])
  })

  it('sorts by folder, then name, so the list groups', () => {
    put('zeta.md'); put('docs/b.md'); put('docs/a.md'); put('a/c.md')
    expect(names()).toEqual(['zeta.md', 'a/c.md', 'docs/a.md', 'docs/b.md'])
  })

  it('does not go deeper than five folders', () => {
    put('a/b/c/d/e/ok.md'); put('a/b/c/d/e/f/too-deep.md')
    expect(names()).toEqual(['a/b/c/d/e/ok.md'])
  })

  it('stops at the limit and says it was cut', () => {
    for (let i = 0; i < MAX_DOCS + 5; i++) put(`d/f${String(i).padStart(4, '0')}.md`)
    const r = scanDocs(dir)
    expect(r.files).toHaveLength(MAX_DOCS)
    expect(r.truncated).toBe(true)
  })

  it('copes with a folder that does not exist', () => {
    expect(scanDocs(join(dir, 'nope'))).toEqual({ files: [], truncated: false })
  })

  it('never reads the contents: a file that cannot be read is still listed', () => {
    put('big.md', 'x'.repeat(5000))
    expect(scanDocs(dir).files[0].bytes).toBe(5000)
  })
})
