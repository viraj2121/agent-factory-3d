import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverProjects, scanRootsFrom } from '../src/discover.ts'

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'disc-'))
  const put = (rel: string) => {
    const file = join(root, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, 'x')
  }
  return { root, put }
}
const names = (list: { path: string }[], root: string) => list.map((p) => p.path.replace(/\\/g, '/').replace(root.replace(/\\/g, '/') + '/', '')).sort()

describe('discoverProjects', () => {
  it('finds folders that have agent setup files, whichever agent they are for', async () => {
    const { root, put } = tree()
    put('a/CLAUDE.md')
    put('b/c/.mcp.json')
    put('d/AGENTS.md')
    put('e/.github/copilot-instructions.md')
    put('f/.vscode/mcp.json')
    put('g/.claude/settings.json')
    put('h/plain/readme.md')
    expect(names(await discoverProjects([root], { exclude: new Set() }), root)).toEqual(['a', 'b/c', 'd', 'e', 'f', 'g'])
  })

  it('skips heavy and system folders, hidden folders, and does not look inside a project it found', async () => {
    const { root, put } = tree()
    put('a/CLAUDE.md')
    put('a/inner/CLAUDE.md')
    put('b/node_modules/pkg/CLAUDE.md')
    put('c/.git/CLAUDE.md')
    put('$RECYCLE.BIN/x/CLAUDE.md')
    put('Windows/System32/CLAUDE.md')
    put('.hidden/z/CLAUDE.md')
    expect(names(await discoverProjects([root], { exclude: new Set() }), root)).toEqual(['a'])
  })

  it('stops at the depth limit and at the folder budget', async () => {
    const { root, put } = tree()
    put('l1/l2/l3/l4/l5/p/CLAUDE.md')
    put('shallow/CLAUDE.md')
    expect(names(await discoverProjects([root], { exclude: new Set(), maxDepth: 3 }), root)).toEqual(['shallow'])
    for (let i = 0; i < 30; i++) put(`many/${i}/CLAUDE.md`)
    expect((await discoverProjects([root], { exclude: new Set(), maxDirs: 10 })).length).toBeLessThan(31)
  })

  it('never reports an excluded folder such as the home folder, but still looks below it', async () => {
    const { root, put } = tree()
    put('home/CLAUDE.md')
    put('home/work/app/CLAUDE.md')
    const home = join(root, 'home').replace(/\\/g, '/').toLowerCase()
    expect(names(await discoverProjects([root], { exclude: new Set([home]) }), root)).toEqual(['home/work/app'])
  })

  it('copes with a root that is not there, and reports the folder time', async () => {
    expect(await discoverProjects([join(tmpdir(), 'no-such-folder-xyz')], { exclude: new Set() })).toEqual([])
    const { root, put } = tree()
    put('a/CLAUDE.md')
    const [p] = await discoverProjects([root], { exclude: new Set() })
    expect(p.mtime).toBeGreaterThan(0)
  })
})

describe('scanRootsFrom', () => {
  it('uses the roots from the environment, else the parents of folders where agents were used, without drive roots', () => {
    expect(scanRootsFrom('E:\\;D:\\Code', ['E:/Projects/agent-factory-3d'])).toEqual(['E:/', 'D:/Code'])
    expect(scanRootsFrom(undefined, ['E:/Projects/agent-factory-3d', 'E:/Projects/Other', 'C:/Users/me/app', 'E:/solo'])).toEqual(['E:/Projects', 'C:/Users/me'])
    expect(scanRootsFrom('', [])).toEqual([])
  })
})
