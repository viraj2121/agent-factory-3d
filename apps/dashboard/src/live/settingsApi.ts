import type { HiddenProject, ServiceSettings } from './wire'

// Talks to /api/settings of the agent service: reads the saved settings and sends one change at a time.
// The service checks every change and writes ~/.ai-factory/settings.json.

export type { HiddenProject, ServiceSettings }

export interface SettingsView {
  settings: ServiceSettings
  /** Where the settings live on this computer. */
  file: string
  /** What was wrong with the file when the service read it. */
  problems: string[]
  /** Days back the service reads now (the setting, or its default). */
  effectiveDays: number
}

export type SettingsPatch = Partial<Pick<ServiceSettings, 'days' | 'roots' | 'hiddenProjects' | 'projectNames' | 'display'>>

/** The same folder, however it is spelled (slashes, case, a trailing slash). */
const sameFolder = (a: string, b: string): boolean => {
  const norm = (p: string) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

export function hidePatch(view: SettingsView, project: HiddenProject): SettingsPatch {
  const list = view.settings.hiddenProjects
  return { hiddenProjects: list.some((h) => sameFolder(h.path, project.path)) ? list : [...list, project] }
}

export function showPatch(view: SettingsView, path: string): SettingsPatch {
  return { hiddenProjects: view.settings.hiddenProjects.filter((h) => !sameFolder(h.path, path)) }
}

export function renamePatch(path: string, name: string): SettingsPatch {
  return { projectNames: { [path]: name.trim() } }
}

export function rootsPatch(view: SettingsView, change: { add?: string; remove?: string }): SettingsPatch {
  let roots = view.settings.roots
  const add = change.add?.trim()
  if (add && !roots.some((r) => sameFolder(r, add))) roots = [...roots, add]
  if (change.remove) roots = roots.filter((r) => !sameFolder(r, change.remove!))
  return { roots }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function parseSettingsView(input: unknown): SettingsView | null {
  if (!isObj(input) || !isObj(input.settings) || typeof input.file !== 'string') return null
  const s = input.settings
  if (!Array.isArray(s.roots) || !Array.isArray(s.hiddenProjects) || !isObj(s.projectNames) || !isObj(s.display)) return null
  if (s.days !== null && typeof s.days !== 'number') return null
  return {
    settings: s as unknown as ServiceSettings,
    file: input.file,
    problems: Array.isArray(input.problems) ? input.problems.filter((p): p is string => typeof p === 'string') : [],
    effectiveDays: typeof input.effectiveDays === 'number' ? input.effectiveDays : 7,
  }
}

export async function fetchSettings(base: string): Promise<SettingsView | null> {
  try {
    const res = await fetch(`${base}/api/settings`)
    return res.ok ? parseSettingsView(await res.json()) : null
  } catch {
    return null
  }
}

/** Sends one change. Returns the new settings, or the service's reason for refusing it. */
export async function putSettings(base: string, patch: SettingsPatch): Promise<{ ok: true; view: SettingsView } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: isObj(body) && typeof body.error === 'string' ? body.error : `The service answered ${res.status}.` }
    const view = parseSettingsView(body)
    return view ? { ok: true, view } : { ok: false, error: 'The service sent something unexpected.' }
  } catch {
    return { ok: false, error: 'The agent service could not be reached.' }
  }
}
