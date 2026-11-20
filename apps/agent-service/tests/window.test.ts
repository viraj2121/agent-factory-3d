import { describe, expect, it } from 'vitest'
import { parseWindowRequest, windowScript, WIDGET_PROFILE_MARK } from '../src/window.ts'

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
})
