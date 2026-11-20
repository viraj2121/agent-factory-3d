// Asks the local agent service to pin, unpin or resize the widget's own window (POST /api/window). The page itself is not
// allowed to change its window, so the service does it with one Windows call. Only works when the widget was opened by
// start-widget.cmd (that is how the service finds the window).

export interface WindowChange {
  pin?: boolean
  width?: number
  height?: number
}

export type WindowAnswer = { ok: true } | { ok: false; error: string }

export async function changeWindow(base: string, change: WindowChange): Promise<WindowAnswer> {
  try {
    const res = await fetch(`${base}/api/window`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (res.status === 404) return { ok: false, error: 'Open the widget with start-widget.cmd to pin or resize it.' }
    return { ok: false, error: body?.error ?? 'The window could not be changed.' }
  } catch {
    return { ok: false, error: 'The agent service is not running.' }
  }
}
