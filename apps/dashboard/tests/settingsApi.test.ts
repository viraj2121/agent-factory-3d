import { describe, expect, it } from 'vitest'
import { hidePatch, parseSettingsView, renamePatch, rootsPatch, showPatch, type SettingsView } from '../src/live/settingsApi'

const view = (over: Partial<SettingsView['settings']> = {}): SettingsView => ({
  settings: { version: 1, days: null, roots: [], hiddenProjects: [], projectNames: {}, display: {}, ...over },
  file: 'C:/Users/me/.ai-factory/settings.json',
  problems: [],
  effectiveDays: 7,
})

describe('patches', () => {
  it('hiding adds the project once, with its name', () => {
    const v = view({ hiddenProjects: [{ path: 'E:/A', name: 'A' }] })
    expect(hidePatch(v, { path: 'E:/B', name: 'B' })).toEqual({ hiddenProjects: [{ path: 'E:/A', name: 'A' }, { path: 'E:/B', name: 'B' }] })
    expect(hidePatch(v, { path: 'e:\\a\\', name: 'A' })).toEqual({ hiddenProjects: [{ path: 'E:/A', name: 'A' }] })
  })

  it('showing removes the project, whatever the spelling of its folder', () => {
    const v = view({ hiddenProjects: [{ path: 'E:/A', name: 'A' }, { path: 'E:/B', name: 'B' }] })
    expect(showPatch(v, 'e:\\b')).toEqual({ hiddenProjects: [{ path: 'E:/A', name: 'A' }] })
  })

  it('renaming sends one name, and an empty one goes back to the folder name', () => {
    expect(renamePatch('E:/A', '  Shop ')).toEqual({ projectNames: { 'E:/A': 'Shop' } })
    expect(renamePatch('E:/A', '')).toEqual({ projectNames: { 'E:/A': '' } })
  })

  it('adding a folder skips one already there, and removing takes it out', () => {
    const v = view({ roots: ['E:\\Code'] })
    expect(rootsPatch(v, { add: ' D:\\Work ' })).toEqual({ roots: ['E:\\Code', 'D:\\Work'] })
    expect(rootsPatch(v, { add: 'e:\\code\\' })).toEqual({ roots: ['E:\\Code'] })
    expect(rootsPatch(v, { remove: 'E:\\Code' })).toEqual({ roots: [] })
  })
})

describe('parseSettingsView', () => {
  it('accepts what the service sends and refuses anything else', () => {
    expect(parseSettingsView(view())).toEqual(view())
    for (const bad of [null, 'x', {}, { settings: {} }, { settings: { hiddenProjects: 'x' }, file: 'f' }]) expect(parseSettingsView(bad)).toBeNull()
  })
})
