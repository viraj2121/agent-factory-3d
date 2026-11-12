import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DisplayValue, HiddenProject, ServiceSettings } from './model.ts'
import { asRecord, projectKey } from './util.ts'

// Settings of the hub, kept in one JSON file (~/.ai-factory/settings.json) so they survive restarts and can be read
// or edited by hand. Two parts: what the service itself uses (how far back to look, extra folders, hidden projects,
// display names) and the dashboard's display choices, which the service stores without using them.
// No setting changes what an agent does: the hub only watches.

export type { DisplayValue, HiddenProject, ServiceSettings } from './model.ts'

export const DEFAULT_SETTINGS: ServiceSettings = { version: 1, days: null, roots: [], hiddenProjects: [], projectNames: {}, display: {} }

const NOTE = 'Settings of the AI Software Factory hub. Changed from the Settings panel; safe to edit by hand while the service is stopped.'
const LIMITS = { roots: 20, hidden: 200, names: 200, display: 40, path: 400, projectName: 60, hiddenName: 120, displayKey: 40, displayText: 100 }

const isAbsolute = (p: string): boolean => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')

type Checked<T> = { value: T; problems: string[] }

function checkDays(v: unknown): Checked<number | null> {
  if (v === null || v === undefined) return { value: null, problems: [] }
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 365) return { value: v, problems: [] }
  return { value: null, problems: ['days must be a whole number from 1 to 365'] }
}

function checkRoots(v: unknown): Checked<string[]> {
  if (v === undefined) return { value: [], problems: [] }
  if (!Array.isArray(v)) return { value: [], problems: ['roots must be a list of folders'] }
  const value: string[] = []
  const problems: string[] = []
  for (const r of v) {
    if (typeof r === 'string' && r.trim() && r.length <= LIMITS.path && isAbsolute(r.trim())) value.push(r.trim())
    else problems.push(`root ${JSON.stringify(r)} is not a full folder path`)
  }
  if (value.length > LIMITS.roots) problems.push(`at most ${LIMITS.roots} folders`)
  return { value: value.slice(0, LIMITS.roots), problems }
}

function checkHidden(v: unknown): Checked<HiddenProject[]> {
  if (v === undefined) return { value: [], problems: [] }
  if (!Array.isArray(v)) return { value: [], problems: ['hiddenProjects must be a list'] }
  const value: HiddenProject[] = []
  const problems: string[] = []
  const seen = new Set<string>()
  for (const h of v) {
    const rec = asRecord(h)
    const path = typeof rec?.path === 'string' ? rec.path.trim() : ''
    const name = typeof rec?.name === 'string' ? rec.name.trim().slice(0, LIMITS.hiddenName) : ''
    if (!path || path.length > LIMITS.path) {
      problems.push('a hidden project has no folder')
      continue
    }
    const key = projectKey(path)
    if (seen.has(key)) continue
    seen.add(key)
    value.push({ path, name: name || path })
  }
  if (value.length > LIMITS.hidden) problems.push(`at most ${LIMITS.hidden} hidden projects`)
  return { value: value.slice(0, LIMITS.hidden), problems }
}

/** Names keyed by folder. In a file an empty name is a problem; in a change it means "back to the folder name". */
function checkNames(v: unknown, base: Record<string, string>, emptyDeletes: boolean): Checked<Record<string, string>> {
  if (v === undefined) return { value: { ...base }, problems: [] }
  const rec = asRecord(v)
  if (!rec) return { value: { ...base }, problems: ['projectNames must be an object of folder: name'] }
  const value: Record<string, string> = { ...base }
  const problems: string[] = []
  for (const [folder, raw] of Object.entries(rec)) {
    const key = projectKey(folder)
    const name = typeof raw === 'string' ? raw.trim() : null
    if (name === null) problems.push(`name for ${folder} must be text`)
    else if (name === '') {
      delete value[key]
      if (!emptyDeletes) problems.push(`name for ${folder} is empty`)
    } else if (name.length > LIMITS.projectName) problems.push(`name for ${folder} is longer than ${LIMITS.projectName} characters`)
    else value[key] = name
  }
  if (Object.keys(value).length > LIMITS.names) problems.push(`at most ${LIMITS.names} project names`)
  return { value, problems }
}

/** Display values: plain text (short), numbers and true/false. In a change, null removes a key. */
function checkDisplay(v: unknown, base: Record<string, DisplayValue>): Checked<Record<string, DisplayValue>> {
  if (v === undefined) return { value: { ...base }, problems: [] }
  const rec = asRecord(v)
  if (!rec) return { value: { ...base }, problems: ['display must be an object'] }
  const value: Record<string, DisplayValue> = { ...base }
  const problems: string[] = []
  for (const [key, raw] of Object.entries(rec)) {
    if (key.length > LIMITS.displayKey) problems.push(`display key ${key.slice(0, 20)}... is too long`)
    else if (raw === null) delete value[key]
    else if (typeof raw === 'boolean' || (typeof raw === 'number' && Number.isFinite(raw)) || (typeof raw === 'string' && raw.length <= LIMITS.displayText)) value[key] = raw
    else problems.push(`display value for ${key} must be short text, a number or true/false`)
  }
  if (Object.keys(value).length > LIMITS.display) problems.push(`at most ${LIMITS.display} display values`)
  return { value, problems }
}

/** Reads settings from a parsed file: wrong values are dropped one by one (and listed), the rest is kept. */
export function parseSettings(input: unknown): { settings: ServiceSettings; problems: string[] } {
  const rec = asRecord(input) ?? {}
  const days = checkDays(rec.days)
  const roots = checkRoots(rec.roots)
  const hidden = checkHidden(rec.hiddenProjects)
  const names = checkNames(rec.projectNames, {}, false)
  const display = checkDisplay(rec.display, {})
  return {
    settings: { version: 1, days: days.value, roots: roots.value, hiddenProjects: hidden.value, projectNames: names.value, display: display.value },
    problems: [...days.problems, ...roots.problems, ...hidden.problems, ...names.problems, ...display.problems],
  }
}

const PATCH_KEYS = new Set(['days', 'roots', 'hiddenProjects', 'projectNames', 'display'])

/**
 * One change from the Settings panel. All of it applies or none of it does. `days`, `roots` and `hiddenProjects`
 * are replaced; `projectNames` and `display` are merged (an empty name or a null value removes the entry).
 */
export function applyPatch(current: ServiceSettings, patch: unknown): { ok: true; settings: ServiceSettings } | { ok: false; error: string } {
  const rec = asRecord(patch)
  if (!rec) return { ok: false, error: 'A settings change must be a JSON object.' }
  const unknown = Object.keys(rec).filter((k) => !PATCH_KEYS.has(k))
  if (unknown.length > 0) return { ok: false, error: `Unknown setting: ${unknown.join(', ')}.` }
  const next: ServiceSettings = { ...current }
  const problems: string[] = []
  if ('days' in rec) {
    const c = checkDays(rec.days)
    problems.push(...c.problems)
    next.days = c.value
  }
  if ('roots' in rec) {
    const c = checkRoots(rec.roots)
    problems.push(...c.problems)
    next.roots = c.value
  }
  if ('hiddenProjects' in rec) {
    const c = checkHidden(rec.hiddenProjects)
    problems.push(...c.problems)
    next.hiddenProjects = c.value
  }
  if ('projectNames' in rec) {
    const c = checkNames(rec.projectNames, current.projectNames, true)
    problems.push(...c.problems)
    next.projectNames = c.value
  }
  if ('display' in rec) {
    const c = checkDisplay(rec.display, current.display)
    problems.push(...c.problems)
    next.display = c.value
  }
  return problems.length > 0 ? { ok: false, error: problems.join('; ') } : { ok: true, settings: next }
}

/** The settings file. Read once at start; written (whole, through a temporary file) on every accepted change. */
export class SettingsStore {
  readonly file: string
  /** What was wrong with the file when it was read, if anything. */
  problems: string[] = []
  private current: ServiceSettings

  constructor(file: string) {
    this.file = file
    this.current = DEFAULT_SETTINGS
    if (!existsSync(file)) return
    try {
      const parsed = parseSettings(JSON.parse(readFileSync(file, 'utf8')))
      this.current = parsed.settings
      this.problems = parsed.problems
    } catch (e) {
      this.problems = [`The settings file could not be read (${e instanceof Error ? e.message : 'unknown error'}); using the defaults. It is left as it is until you change a setting.`]
    }
  }

  get(): ServiceSettings {
    return this.current
  }

  update(patch: unknown): { ok: true; settings: ServiceSettings } | { ok: false; error: string } {
    const result = applyPatch(this.current, patch)
    if (!result.ok) return result
    mkdirSync(dirname(this.file), { recursive: true })
    const temp = `${this.file}.tmp`
    writeFileSync(temp, JSON.stringify({ _note: NOTE, ...result.settings }, null, 2) + '\n')
    renameSync(temp, this.file)
    this.current = result.settings
    this.problems = []
    return result
  }
}
