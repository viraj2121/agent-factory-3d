import { describe, expect, it } from 'vitest'
import { hallScript, hallUrl, parseWindowRequest, windowScript, WIDGET_PROFILE_MARK, TAB_SCRIPT_MARK } from '../src/window.ts'

describe('parseWindowRequest', () => {
  it('accepts a pin change, a new size, or both', () => {
    expect(parseWindowRequest({ pin: true })).toEqual({ ok: true, request: { pin: true } })
    expect(parseWindowRequest({ pin: false })).toEqual({ ok: true, request: { pin: false } })
    expect(parseWindowRequest({ width: 380, height: 96 })).toEqual({ ok: true, request: { width: 380, height: 96 } })
    expect(parseWindowRequest({ pin: true, width: 380, height: 680 })).toEqual({ ok: true, request: { pin: true, width: 380, height: 680 } })
  })
  it('turns a size into whole pixels', () => {
    expect(parseWindowRequest({ width: 380.6, height: 95.2 })).toEqual({ ok: true, request: { width: 381, height: 95 } })
  })
  it('accepts a place on the screen (both x and y, may be off the left or top edge) and a see-through level', () => {
    expect(parseWindowRequest({ x: 1800, y: 400 })).toEqual({ ok: true, request: { x: 1800, y: 400 } })
    expect(parseWindowRequest({ x: -1920.4, y: 0, width: 600, height: 300 })).toEqual({ ok: true, request: { x: -1920, y: 0, width: 600, height: 300 } })
    expect(parseWindowRequest({ opacity: 40 })).toEqual({ ok: true, request: { opacity: 40 } })
    expect(parseWindowRequest({ opacity: 99.6 })).toEqual({ ok: true, request: { opacity: 100 } })
  })
  it('refuses a place with only one of x and y, a place far off every screen, and a window so faint it could be lost', () => {
    for (const bad of [{ x: 10 }, { y: 10 }, { x: 'left', y: 0 }, { x: 30000, y: 0 }, { x: 0, y: -30000 }, { opacity: 5 }, { opacity: 101 }, { opacity: '50' }]) {
      expect(parseWindowRequest(bad).ok).toBe(false)
    }
  })
  it('accepts hiding the window (docking it into the edge tab), alone', () => {
    expect(parseWindowRequest({ hide: true })).toEqual({ ok: true, request: { hide: true } })
    for (const bad of [{ hide: false }, { hide: 'yes' }, { hide: true, pin: true }, { hide: true, opacity: 50 }]) expect(parseWindowRequest(bad).ok).toBe(false)
  })
  it('refuses anything else: nothing to do, a size alone in one direction, wrong types, sizes out of range, other keys', () => {
    for (const bad of [null, [], 'pin', {}, { pin: 'yes' }, { width: 380 }, { height: 90 }, { width: 10, height: 90 }, { width: 380, height: 5000 }, { width: Number.NaN, height: 90 }, { pin: true, run: 'calc.exe' }]) {
      expect(parseWindowRequest(bad).ok).toBe(false)
    }
  })
})

describe('windowScript', () => {
  it('acts only on the widget window: the Edge started with the widget profile', () => {
    const s = windowScript({ pin: true })
    expect(s).toContain(WIDGET_PROFILE_MARK)
    expect(s).toContain("Name='msedge.exe'")
  })
  it('looks through every window of that Edge for the one titled "Agents", not just its main window (the 3D hall may be open in the same Edge)', () => {
    const s = windowScript({ pin: true })
    expect(s).toContain('EnumWindows')
    expect(s).toContain("'Agents'")
    expect(s).not.toContain('MainWindowHandle')
  })
  it('pins with HWND_TOPMOST and unpins with HWND_NOTOPMOST, without moving or resizing', () => {
    const pin = windowScript({ pin: true })
    expect(pin).toContain('[System.IntPtr]::new(-1)')
    expect(pin).toContain(String(0x1 | 0x2 | 0x10)) // no size, no move, no activate
    expect(windowScript({ pin: false })).toContain('[System.IntPtr]::new(-2)')
  })
  it('resizes without moving and without touching the order when no pin is given', () => {
    const s = windowScript({ width: 380, height: 96 })
    expect(s).toContain(', 0, 0, 380, 96,')
    expect(s).toContain(String(0x2 | 0x4 | 0x10)) // no move, no z-order, no activate
  })
  it('puts only numbers it was given into the script (nothing from outside is pasted in as text)', () => {
    const s = windowScript({ pin: true, width: 400, height: 700 })
    expect(s).toContain(', 0, 0, 400, 700,')
    expect(s).not.toMatch(/\$\{|undefined|NaN/)
  })
  it('moves without resizing when only a place is given, and moves and resizes when both are', () => {
    const move = windowScript({ x: 1800, y: 400 })
    expect(move).toContain(', 1800, 400, 0, 0,')
    expect(move).toContain(`, ${0x1 | 0x4 | 0x10})`) // no size, no z-order, no activate
    const both = windowScript({ x: -20, y: 5, width: 600, height: 300 })
    expect(both).toContain(', -20, 5, 600, 300,')
    expect(both).toContain(`, ${0x4 | 0x10})`)
  })
  it('makes the window see-through with a layered window and an alpha from 0 to 255, without a SetWindowPos when nothing else changes', () => {
    const s = windowScript({ opacity: 40 })
    expect(s).toContain('SetLayeredWindowAttributes($h, 0, 102, 2)')
    expect(s).toContain('0x80000')
    expect(s).not.toContain('::SetWindowPos(')
    expect(windowScript({ opacity: 100 })).toContain('SetLayeredWindowAttributes($h, 0, 255, 2)')
    expect(windowScript({ pin: true })).not.toContain('SetLayeredWindowAttributes($h')
  })
  it('hides the window only while the edge tab runs, so it can always be brought back (exit 4 when the tab is missing)', () => {
    const s = windowScript({ hide: true })
    expect(s).toContain(TAB_SCRIPT_MARK)
    expect(s).toContain("Name='powershell.exe'")
    expect(s).toContain('exit 4')
    expect(s).toContain('ShowWindow($h, 0)')
    expect(s.indexOf('exit 4')).toBeLessThan(s.indexOf('ShowWindow($h, 0)'))
    expect(windowScript({ pin: true })).not.toContain('ShowWindow($h')
  })
})

describe('hallUrl (what "Open 3D hall" opens)', () => {
  it('opens the dashboard that asked, or the default one', () => {
    expect(hallUrl('http://localhost:5173')).toBe('http://localhost:5173/')
    expect(hallUrl('http://127.0.0.1:5180')).toBe('http://127.0.0.1:5180/')
    expect(hallUrl(undefined)).toBe('http://localhost:5173/')
  })
  it('never opens another address, whatever the Origin says', () => {
    expect(hallUrl('https://evil.example')).toBe('http://localhost:5173/')
    expect(hallUrl('http://localhost:5173.evil.example')).toBe('http://localhost:5173/')
    expect(hallUrl("http://localhost:5173'; calc")).toBe('http://localhost:5173/')
  })
  it('can open one project, by a plain id only', () => {
    expect(hallUrl('http://localhost:5173', 'atlas-app-1a2b3c')).toBe('http://localhost:5173/?project=atlas-app-1a2b3c')
    expect(hallUrl('http://localhost:5173', "x'; calc")).toBe('http://localhost:5173/')
    expect(hallUrl('http://localhost:5173', '../..')).toBe('http://localhost:5173/')
  })
})

describe('hallScript', () => {
  it('starts Edge maximized in the widget profile, then maximizes the new window itself in case Edge ignored the flag', () => {
    const s = hallScript('http://localhost:5173/')
    expect(s).toContain('--start-maximized')
    expect(s).toContain('--new-window')
    expect(s).toContain("'http://localhost:5173/'")
    expect(s).toContain('ShowWindow($h, 3)')
    expect(s).toContain(WIDGET_PROFILE_MARK)
  })
  it('only maximizes a window that is not the widget itself', () => {
    expect(hallScript('http://localhost:5173/')).toContain("FindOther($ids, 'Agents')")
  })
})
