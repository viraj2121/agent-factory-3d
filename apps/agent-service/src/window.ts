import { execFile } from 'node:child_process'

// The desktop widget's window: pin it on top, unpin it, or change its size (collapse and expand). This touches nothing but
// the widget's own Edge window, found by the private profile folder it was started with (scripts/widget-window.ps1). The
// script is built from fixed text and whole numbers only; nothing from a request is pasted in as text. Windows only.

/** Part of the command line of the widget's Edge: its own profile folder. */
export const WIDGET_PROFILE_MARK = 'agent-factory-3d\\widget-edge'

export interface WindowRequest {
  /** true = always on top, false = a normal window. Left out = leave it as it is. */
  pin?: boolean
  /** New outer size in pixels (both or neither). */
  width?: number
  height?: number
}

const KEYS = new Set(['pin', 'width', 'height'])
const MIN = 60
const MAX = 3000

export function parseWindowRequest(input: unknown): { ok: true; request: WindowRequest } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Send a JSON object.' }
  const o = input as Record<string, unknown>
  if (Object.keys(o).some((k) => !KEYS.has(k))) return { ok: false, error: 'Only pin, width and height are allowed.' }
  const request: WindowRequest = {}
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
  if (request.pin === undefined && request.width === undefined) return { ok: false, error: 'Nothing to do.' }
  return { ok: true, request }
}

/** C# for Add-Type: finds a visible window of the given processes whose title starts with a prefix, and SetWindowPos. */
const FINDER = "using System; using System.Runtime.InteropServices; using System.Text;\nnamespace AgentFactoryWidget { public static class Win {\n  public delegate bool EnumProc(IntPtr h, IntPtr p);\n  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);\n  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);\n  [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);\n  [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);\n  [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);\n  public static IntPtr Find(int[] pids, string prefix) {\n    IntPtr found = IntPtr.Zero;\n    EnumWindows(delegate (IntPtr h, IntPtr p) {\n      if (!IsWindowVisible(h)) return true;\n      int pid; GetWindowThreadProcessId(h, out pid);\n      if (Array.IndexOf(pids, pid) < 0) return true;\n      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);\n      if (sb.ToString().StartsWith(prefix)) { found = h; return false; }\n      return true;\n    }, IntPtr.Zero);\n    return found;\n  }\n} }"

const NOSIZE = 0x1, NOMOVE = 0x2, NOZORDER = 0x4, NOACTIVATE = 0x10

/** The PowerShell that finds the widget window and calls SetWindowPos once. Exit code 3: the widget window is not open. */
export function windowScript(r: WindowRequest): string {
  const sized = r.width !== undefined && r.height !== undefined
  const after = r.pin === undefined ? 0 : r.pin ? -1 : -2 // HWND_TOPMOST, HWND_NOTOPMOST
  const flags = NOMOVE | NOACTIVATE | (sized ? 0 : NOSIZE) | (r.pin === undefined ? NOZORDER : 0)
  const w = sized ? Math.round(r.width!) : 0
  const h = sized ? Math.round(r.height!) : 0
  return [
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
    `[void][AgentFactoryWidget.Win]::SetWindowPos($h, [System.IntPtr]::new(${after}), 0, 0, ${w}, ${h}, ${flags})`,
  ].join('\n')
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
      resolve(code === 3 ? { ok: false, status: 404, error: 'The widget window is not open.' } : { ok: false, status: 500, error: 'This computer did not allow changing the widget window.' })
    })
  })
}
