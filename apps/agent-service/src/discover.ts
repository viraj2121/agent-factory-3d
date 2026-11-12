import { existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanPath, projectKey } from './util.ts'

// Finds folders that have agent setup files (instructions, .mcp.json, .claude, .codex, ...) even when no agent has run
// there lately. It never walks the whole disk by itself: the roots are the parents of folders where agents were used,
// or the folders named in AGENT_SERVICE_ROOTS. Depth, folder count and time are limited; system and cache folders are skipped.

const MARKER_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.mcp.json', '.cursorrules']
const MARKER_DIRS = ['.claude', '.codex']
const MARKER_PATHS = [['.github', 'copilot-instructions.md'], ['.vscode', 'mcp.json']]

const SKIP = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'bin', 'obj', 'venv', 'env', '__pycache__', 'coverage',
  '$recycle.bin', 'system volume information', 'windows', 'program files', 'program files (x86)', 'programdata', 'appdata', 'recovery',
])

export interface Discovered {
  path: string
  /** Folder modification time, used to put the newest first. */
  mtime: number
}

export interface DiscoverOptions {
  /** Folders (as projectKey) never reported as projects, such as the home folder, though their children are still looked at. */
  exclude: ReadonlySet<string>
  maxDepth?: number
  maxDirs?: number
  deadlineMs?: number
}

function hasSetup(dir: string, names: ReadonlySet<string>): boolean {
  if (MARKER_FILES.some((f) => names.has(f)) || MARKER_DIRS.some((d) => names.has(d))) return true
  return MARKER_PATHS.some(([a, b]) => names.has(a) && existsSync(join(dir, a, b)))
}

export async function discoverProjects(roots: string[], opts: DiscoverOptions): Promise<Discovered[]> {
  const { exclude, maxDepth = 4, maxDirs = 20_000, deadlineMs = 8_000 } = opts
  const stop = Date.now() + deadlineMs
  const found = new Map<string, Discovered>()
  let visited = 0
  let queue: { dir: string; depth: number }[] = roots.map((dir) => ({ dir, depth: 0 }))
  while (queue.length > 0 && visited < maxDirs && Date.now() < stop) {
    const next: typeof queue = []
    for (const { dir, depth } of queue) {
      if (visited++ >= maxDirs || Date.now() >= stop) break
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      const names = new Set(entries.map((e) => e.name))
      if (!exclude.has(projectKey(dir)) && hasSetup(dir, names)) {
        const path = cleanPath(dir)
        let mtime = 0
        try {
          mtime = statSync(dir).mtimeMs
        } catch {
          // keep 0
        }
        found.set(projectKey(path), { path, mtime })
        continue // a project: its inner folders are not looked at
      }
      if (depth >= maxDepth) continue
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name.toLowerCase())) next.push({ dir: join(dir, e.name), depth: depth + 1 })
      }
    }
    queue = next
  }
  return [...found.values()]
}

/** Folders to look in: those named in the environment, else the parent folder of each folder agents were used in (never a drive root). */
export function scanRootsFrom(env: string | undefined, knownFolders: string[]): string[] {
  const out: string[] = []
  const add = (p: string) => {
    const c = cleanPath(p)
    if (c && !out.some((o) => projectKey(o) === projectKey(c))) out.push(c)
  }
  const explicit = (env ?? '').split(';').map((s) => s.trim()).filter(Boolean)
  if (explicit.length > 0) {
    explicit.forEach(add)
    return out
  }
  for (const folder of knownFolders) {
    const c = cleanPath(folder)
    const cut = c.lastIndexOf('/')
    const parent = cut > 0 ? c.slice(0, cut) : ''
    if (parent && !/^[a-zA-Z]:$/.test(parent)) add(parent)
  }
  return out
}
