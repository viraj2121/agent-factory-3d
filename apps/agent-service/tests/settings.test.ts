import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore, applyPatch, parseSettings } from '../src/settings.ts'

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'settings-')), 'sub', 'settings.json')

describe('parseSettings', () => {
  it('gives the defaults for nothing, garbage or a list', () => {
    for (const bad of [undefined, null, 'x', 5, [], {}]) expect(parseSettings(bad).settings).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps every valid value', () => {
    const input = {
      version: 1,
      days: 30,
      roots: ['E:\\Code', '/home/me/work'],
      hiddenProjects: [{ path: 'E:/Work/Old', name: 'Old' }],
      projectNames: { 'e:/work/app': 'Shop front' },
      display: { quality: 'high', labels: 'names', fps: false, tourSeconds: 60 },
    }
    expect(parseSettings(input)).toEqual({ settings: input, problems: [] })
  })

  it('drops values that are wrong, says which, and keeps the rest', () => {
    const { settings, problems } = parseSettings({
      days: 9999,
      roots: ['relative/path', 'E:\\Good', 7],
      hiddenProjects: [{ path: 'E:/A', name: 'A' }, { path: 5 }, 'x'],
      projectNames: { 'e:/a': '', 'e:/b': 'B', 'e:/c': 'x'.repeat(200) },
      display: { ok: 'yes', nested: { no: 1 }, long: 'x'.repeat(300) },
    })
    expect(settings.days).toBeNull()
    expect(settings.roots).toEqual(['E:\\Good'])
    expect(settings.hiddenProjects).toEqual([{ path: 'E:/A', name: 'A' }])
    expect(settings.projectNames).toEqual({ 'e:/b': 'B' })
    expect(settings.display).toEqual({ ok: 'yes' })
    expect(problems.length).toBeGreaterThanOrEqual(5)
  })

  it('ignores a note and unknown keys in the file', () => {
    expect(parseSettings({ _note: 'hello', other: 1, days: 7 }).settings.days).toBe(7)
  })
})

describe('applyPatch', () => {
  it('changes only the keys given', () => {
    const r = applyPatch(DEFAULT_SETTINGS, { days: 30 })
    expect(r).toEqual({ ok: true, settings: { ...DEFAULT_SETTINGS, days: 30 } })
  })

  it('refuses the whole change when one value is wrong or a key is unknown, so nothing half-applies', () => {
    expect(applyPatch(DEFAULT_SETTINGS, { days: 30, roots: ['not absolute'] }).ok).toBe(false)
    expect(applyPatch(DEFAULT_SETTINGS, { colour: 'red' }).ok).toBe(false)
    expect(applyPatch(DEFAULT_SETTINGS, 'x').ok).toBe(false)
    expect(applyPatch(DEFAULT_SETTINGS, { days: 0 }).ok).toBe(false)
    expect(applyPatch(DEFAULT_SETTINGS, { hiddenProjects: Array.from({ length: 300 }, (_, i) => ({ path: 'E:/p' + i, name: 'p' })) }).ok).toBe(false)
  })

  it('accepts null days (back to the default) and keeps project names keyed by the folder without case', () => {
    const r = applyPatch({ ...DEFAULT_SETTINGS, days: 30 }, { days: null, projectNames: { 'E:\\Work\\App\\': 'Shop' } })
    expect(r.ok && r.settings.days).toBeNull()
    expect(r.ok && r.settings.projectNames).toEqual({ 'e:/work/app': 'Shop' })
  })

  it('trims a project name and drops an empty one (back to the folder name)', () => {
    const r = applyPatch({ ...DEFAULT_SETTINGS, projectNames: { 'e:/a': 'A' } }, { projectNames: { 'e:/a': '   ', 'e:/b': '  Bee ' } })
    expect(r.ok && r.settings.projectNames).toEqual({ 'e:/b': 'Bee' })
  })

  it('does not keep two hidden entries for one folder', () => {
    const r = applyPatch(DEFAULT_SETTINGS, { hiddenProjects: [{ path: 'E:/Work/App', name: 'App' }, { path: 'e:\\work\\app\\', name: 'App' }] })
    expect(r.ok && r.settings.hiddenProjects).toEqual([{ path: 'E:/Work/App', name: 'App' }])
  })
})

describe('SettingsStore', () => {
  it('starts with the defaults when there is no file, without writing one', () => {
    const file = tempFile()
    const store = new SettingsStore(file)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(existsSync(file)).toBe(false)
  })

  it('writes a readable JSON file with a note on change, and reads it back next time', () => {
    const file = tempFile()
    const store = new SettingsStore(file)
    const r = store.update({ hiddenProjects: [{ path: 'E:/Work/Old', name: 'Old' }] })
    expect(r.ok).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(JSON.parse(text)._note).toMatch(/AI Software Factory/)
    expect(text).toContain('\n  ')
    expect(new SettingsStore(file).get().hiddenProjects).toEqual([{ path: 'E:/Work/Old', name: 'Old' }])
  })

  it('keeps a broken file untouched, starts with what it could read, and reports the problem', () => {
    const file = tempFile()
    new SettingsStore(file).update({ days: 30 })
    writeFileSync(file, '{ not json')
    const store = new SettingsStore(file)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(store.problems[0]).toMatch(/could not be read/i)
    expect(readFileSync(file, 'utf8')).toBe('{ not json')
  })

  it('does not change the file when a change is refused', () => {
    const file = tempFile()
    const store = new SettingsStore(file)
    store.update({ days: 30 })
    const before = readFileSync(file, 'utf8')
    expect(store.update({ days: -1 }).ok).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(store.get().days).toBe(30)
  })
})
