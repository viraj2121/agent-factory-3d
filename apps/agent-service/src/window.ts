import { execFile } from 'node:child_process'

// The desktop widget's window: pin it on top, unpin it, change its size, move it, make it see-through (it fades when left
// alone) and hide it while it is docked in the edge tab (scripts/widget-tab.ps1 shows it again). This touches nothing but
// the widget's own Edge window, found by the private profile folder it was started with (scripts/widget-window.ps1). The
// script is built from fixed text and whole numbers only; nothing from a request is pasted in as text. Windows only.

/** Part of the command line of the widget's Edge: its own profile folder. */
export const WIDGET_PROFILE_MARK = 'agent-factory-3d\\widget-edge'
/** Part of the command line of the edge tab (a small PowerShell window at the right edge of the screen). */
export const TAB_SCRIPT_MARK = 'widget-tab.ps1'

export interface WindowRequest {
  /** true = always on top, false = a normal window. Left out = leave it as it is. */
  pin?: boolean
  /** New outer size in pixels (both or neither). */
  width?: number
  height?: number
  /** New place of the top left corner in screen pixels (both or neither). */
  x?: number
  y?: number
  /** How solid the window is, from 15 (faint) to 100 (solid). It fades when left alone. */
  opacity?: number
  /** Hide the window: it is docked, and the edge tab stands in for it until clicked. Only on its own, and only while the
   *  tab runs, so the window can always be brought back. */
  hide?: true
}

const KEYS = new Set(['pin', 'width', 'height', 'x', 'y', 'opacity', 'hide'])
/** No screen is this far from the main one, so a place beyond it is a mistake. */
const FAR = 20000
/** The faintest the window may get, so it can never be lost. */
const FAINTEST = 15
const MIN = 60
const MAX = 3000

export function parseWindowRequest(input: unknown): { ok: true; request: WindowRequest } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Send a JSON object.' }
  const o = input as Record<string, unknown>
  if (Object.keys(o).some((k) => !KEYS.has(k))) return { ok: false, error: 'Only pin, width, height, x, y, opacity and hide are allowed.' }
  const request: WindowRequest = {}
  if ('hide' in o) {
    if (o.hide !== true) return { ok: false, error: 'hide can only be true (the edge tab shows the window again).' }
    if (Object.keys(o).length > 1) return { ok: false, error: 'hide goes on its own.' }
    return { ok: true, request: { hide: true } }
  }
  if ('pin' in o) {
    if (typeof o.pin !== 'boolean') return { ok: false, error: 'pin must be true or false.' }
    request.pin = o.pin
  }
  if ('width' in o || 'height' in o) {
    const w = o.width, h = o.height
    if (typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h)) return { ok: false, error: 'Give both width and height as numbers.' }
    if (w < MIN || h < MIN || w > MAX || h > MAX) return { ok: false, error: `Width and height must be between ${MIN} and ${MAX}.` }
    request.width = Math.round(w)
    request.height = Math.round(h)
  }
  if ('x' in o || 'y' in o) {
    const x = o.x, y = o.y
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Give both x and y as numbers.' }
    if (Math.abs(x) > FAR || Math.abs(y) > FAR) return { ok: false, error: `x and y must be between -${FAR} and ${FAR}.` }
    request.x = Math.round(x)
    request.y = Math.round(y)
  }
  if ('opacity' in o) {
    const v = o.opacity
    if (typeof v !== 'number' || !Number.isFinite(v) || v < FAINTEST || v > 100) return { ok: false, error: `opacity must be a number from ${FAINTEST} to 100.` }
    request.opacity = Math.round(v)
  }
  if (request.pin === undefined && request.width === undefined && request.x === undefined && request.opacity === undefined) return { ok: false, error: 'Nothing to do.' }
  return { ok: true, request }
}

/** C# for Add-Type: finds a visible window of the given processes whose title starts with a prefix, and SetWindowPos. */
const FINDER = "using System; using System.Runtime.InteropServices; using System.Text;\nnamespace AgentFactoryWidget { public static class Win {\n  public delegate bool EnumProc(IntPtr h, IntPtr p);\n  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);\n  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);\n  [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);\n  [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);\n  [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);\n  [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int cmd);\n  [DllImport(\"user32.dll\")] public static extern int GetWindowLong(IntPtr h, int index);\n  [DllImport(\"user32.dll\")] public static extern int SetWindowLong(IntPtr h, int index, int value);\n  [DllImport(\"user32.dll\")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);\n  public static IntPtr Find(int[] pids, string prefix) {\n    IntPtr found = IntPtr.Zero;\n    EnumWindows(delegate (IntPtr h, IntPtr p) {\n      if (!IsWindowVisible(h)) return true;\n      int pid; GetWindowThreadProcessId(h, out pid);\n      if (Array.IndexOf(pids, pid) < 0) return true;\n      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);\n      if (sb.ToString().StartsWith(prefix)) { found = h; return false; }\n      return true;\n    }, IntPtr.Zero);\n    return found;\n  }\n} }"

const NOSIZE = 0x1, NOMOVE = 0x2, NOZORDER = 0x4, NOACTIVATE = 0x10

const GWL_EXSTYLE = -20, WS_EX_LAYERED = 0x80000, LWA_ALPHA = 2

/** The PowerShell that finds the widget window, calls SetWindowPos once (pin, size, place) and sets how see-through it is.
 *  Exit code 3: the widget window is not open. Exit code 4: hiding was asked but the edge tab is not running. */
export function windowScript(r: WindowRequest): string {
  const sized = r.width !== undefined && r.height !== undefined
  const moved = r.x !== undefined && r.y !== undefined
  const after = r.pin === undefined ? 0 : r.pin ? -1 : -2 // HWND_TOPMOST, HWND_NOTOPMOST
  const flags = NOACTIVATE | (moved ? 0 : NOMOVE) | (sized ? 0 : NOSIZE) | (r.pin === undefined ? NOZORDER : 0)
  const w = sized ? Math.round(r.width!) : 0
  const h = sized ? Math.round(r.height!) : 0
  const x = moved ? Math.round(r.x!) : 0
  const y = moved ? Math.round(r.y!) : 0
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    // a small window finder: the widget's Edge may hold other windows too (the 3D hall opened from the widget), so look
    // through all its visible windows for the one whose title starts with "Agents"
    "Add-Type -TypeDefinition @'",
    FINDER,
    "'@",
    `$ids = [int[]]@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${WIDGET_PROFILE_MARK}*' } | ForEach-Object { $_.ProcessId })`,
    'if ($ids.Count -eq 0) { exit 3 }',
    "$h = [AgentFactoryWidget.Win]::Find($ids, 'Agents')",
    'if ($h -eq [System.IntPtr]::Zero) { exit 3 }',
  ]
  if (r.hide) {
    // never hide the window when nothing could bring it back
    lines.push(`$tab = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*${TAB_SCRIPT_MARK}*' })`)
    lines.push('if ($tab.Count -eq 0) { exit 4 }')
    lines.push('[void][AgentFactoryWidget.Win]::ShowWindow($h, 0)')
    return lines.join('\n')
  }
  if (r.pin !== undefined || sized || moved) lines.push(`[void][AgentFactoryWidget.Win]::SetWindowPos($h, [System.IntPtr]::new(${after}), ${x}, ${y}, ${w}, ${h}, ${flags})`)
  if (r.opacity !== undefined) {
    // one alpha for the whole window (a layered window); at 100 it is solid again
    const alpha = Math.round((Math.min(100, Math.max(FAINTEST, r.opacity)) / 100) * 255)
    lines.push(`$ex = [AgentFactoryWidget.Win]::GetWindowLong($h, ${GWL_EXSTYLE})`)
    lines.push(`[void][AgentFactoryWidget.Win]::SetWindowLong($h, ${GWL_EXSTYLE}, ($ex -bor 0x${WS_EX_LAYERED.toString(16)}))`)
    lines.push(`[void][AgentFactoryWidget.Win]::SetLayeredWindowAttributes($h, 0, ${alpha}, ${LWA_ALPHA})`)
  }
  return lines.join('\n')
}

export type WindowResult = { ok: true } | { ok: false; status: number; error: string }
export type WindowControl = (r: WindowRequest) => Promise<WindowResult>

/** Runs the script on Windows; elsewhere the widget window cannot be changed and says so. */
export const windowControl: WindowControl = (r) => {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, status: 501, error: 'Pinning and resizing the widget works on Windows only.' })
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', windowScript(r)], { timeout: 8000, windowsHide: true }, (err) => {
      if (!err) return resolve({ ok: true })
      // a process that ran and ended with an exit code reports it as a number
      const code: unknown = (err as { code?: unknown }).code
      resolve(code === 3 ? { ok: false, status: 404, error: 'The widget window is not open.' } : code === 4 ? { ok: false, status: 409, error: 'The edge tab is not running. Start the widget with start-widget.cmd to dock it.' } : { ok: false, status: 500, error: 'This computer did not allow changing the widget window.' })
    })
  })
}
