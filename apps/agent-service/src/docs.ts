import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocFile } from './model.ts'

// The markdown files of a project (READMEs, notes, design docs), for the library. Only the name, the size and the date
// are read: never the contents. The files that steer agents (instructions, skills, agent files) belong to the harness,
// so they are left out, and so are dependency, build and hidden folders.

export const MAX_DOCS = 300
const MAX_DEPTH = 5
const MAX_DIRS = 2000
const MAX_MS = 2500

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', 'vendor', '__pycache__', 'skills', 'agents'])
const STEERING = new Set(['claude.md', 'agents.md', 'skill.md', 'copilot-instructions.md', 'gemini.md'])
const MARKDOWN = /\.(md|markdown|mdx)$/i

export interface DocsResult {
  files: DocFile[]
  /** True when there were more files than the list holds. */
  truncated: boolean
}

export function scanDocs(projectPath: string): DocsResult {
  const files: DocFile[] = []
  const started = Date.now()
  let dirs = 0
  let truncated = false

  const walk = (abs: string, rel: string, depth: number): void => {
    if (truncated || dirs >= MAX_DIRS || Date.now() - started > MAX_MS) return
    dirs++
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isFile() || !MARKDOWN.test(e.name) || STEERING.has(e.name.toLowerCase())) continue
      if (files.length >= MAX_DOCS) {
        truncated = true
        return
      }
      try {
        const st = statSync(join(abs, e.name))
        files.push({ path: rel ? `${rel}/${e.name}` : e.name, name: e.name, bytes: st.size, modifiedAt: Math.round(st.mtimeMs) })
      } catch {
        // gone while we looked: leave it out
      }
    }
    if (depth >= MAX_DEPTH) return
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name.toLowerCase())) continue
      walk(join(abs, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1)
    }
  }
  walk(projectPath, '', 0)

  const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
  files.sort((a, b) => {
    const da = dirOf(a.path)
    const db = dirOf(b.path)
    return da === db ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : da < db ? -1 : 1
  })
  return { files, truncated }
}
