import { useEffect, useRef } from 'react'
import { MOON_LOOK } from '../systemLayout'
import type { WidgetRow } from '../widgetRows'
import { orbitPick, orbitSpot, RING } from './orbit'

// The Orbit at the top of the widget: you are the light in the middle, every agent circles you (orbit.ts decides where).
// Drawn on one canvas, paused while the window is hidden. Colour = the tool, the thin ring round each one = its state.
// `mini` is the docked tab: a small round sky with no names.

const STATE_COLOUR = { wait: '#ffb547', run: '#4ee7a0', rest: '#7f889c' } as const
export const toolColour = (agent: string): string => (MOON_LOOK[agent as keyof typeof MOON_LOOK] ?? MOON_LOOK.other).colour

interface Placed { row: WidgetRow; x: number; y: number; r: number }

function glowOrb(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, alpha: number) {
  g.globalAlpha = alpha
  const halo = g.createRadialGradient(x, y, 0, x, y, r * 2.6)
  halo.addColorStop(0, c + 'aa')
  halo.addColorStop(1, c + '00')
  g.fillStyle = halo
  g.beginPath(); g.arc(x, y, r * 2.6, 0, 7); g.fill()
  const body = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  body.addColorStop(0, '#ffffff'); body.addColorStop(0.3, c); body.addColorStop(1, '#171222')
  g.fillStyle = body
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  g.globalAlpha = 1
}

export default function OrbitSky({ rows, mini = false, onPick, height }: { rows: WidgetRow[]; mini?: boolean; onPick?: (key: string) => void; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const placed = useRef<Placed[]>([])
  const hover = useRef<string | null>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const g = cv.getContext('2d')
    if (!g) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let w = 0, h = 0
    const fit = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2)
      w = cv.clientWidth; h = cv.clientHeight
      cv.width = Math.max(1, Math.round(w * d)); cv.height = Math.max(1, Math.round(h * d))
      g.setTransform(d, 0, 0, d, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    const start = performance.now()

    const draw = (ms: number) => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) return
      const t = reduced ? 0 : (ms - start) / 1000
      const shown = orbitPick(rowsRef.current, mini ? 8 : 14)
      const waiting = shown.some((r) => r.state === 'wait')
      const cx = w / 2, cy = h / 2 + (mini ? 0 : 4)
      const R = mini ? Math.min(w, h) / 2 - 6 : Math.min(w / 2 - 22, (h / 2 - 14) / 0.62)
      const k = mini ? 1 : 0.62 // the sky is seen at a slant; the tab looks straight down
      g.clearRect(0, 0, w, h)

      // the three rings
      g.setLineDash([2, 5]); g.lineWidth = 1
      for (const s of ['wait', 'run', 'rest'] as const) {
        g.strokeStyle = STATE_COLOUR[s] + '30'
        g.beginPath(); g.ellipse(cx, cy, R * RING[s], R * RING[s] * k, 0, 0, 7); g.stroke()
      }
      g.setLineDash([])

      // you: warm when someone waits for you, cool otherwise
      const pulse = 1 + 0.07 * Math.sin(t * 2.4)
      const coreR = (mini ? 13 : 30) * pulse
      const core = g.createRadialGradient(cx, cy, 0, cx, cy, coreR)
      core.addColorStop(0, '#ffffff')
      core.addColorStop(0.25, waiting ? '#ffd9a0' : '#cfe4ff')
      core.addColorStop(0.6, waiting ? '#ffb54733' : '#5b8cff2a')
      core.addColorStop(1, '#00000000')
      g.fillStyle = core
      g.beginPath(); g.arc(cx, cy, coreR, 0, 7); g.fill()
      if (!mini) {
        g.fillStyle = '#1a1206'; g.font = '600 9px Segoe UI, sans-serif'; g.textAlign = 'center'
        g.fillText('YOU', cx, cy + 3)
      }

      const out: Placed[] = []
      for (const row of shown) {
        const spot = orbitSpot(row)
        const ang = spot.phase + spot.speed * t
        let r = R * spot.radius
        if (row.state === 'wait') r += Math.sin(t * 1.7 + spot.phase) * (mini ? 1 : 2)
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * k
        const c = toolColour(row.entry.agent)
        const size = (row.state === 'rest' ? 4.2 : 6.2) * (mini ? 0.7 : 1) * (hover.current === row.key ? 1.3 : 1)
        if (row.state === 'run') {
          // a comet trail behind a working agent
          for (let j = 1; j < 16; j++) {
            const a = ang - j * 0.045
            g.globalAlpha = (1 - j / 16) * 0.45
            g.fillStyle = c
            g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * k, size * 0.55 * (1 - j / 20), 0, 7); g.fill()
          }
          g.globalAlpha = 1
        }
        if (row.state === 'wait') {
          // pulses travelling to you, and a ripple
          for (let j = 0; j < 2; j++) {
            const f = (t * 0.6 + j / 2 + spot.phase) % 1
            g.globalAlpha = Math.sin(f * Math.PI)
            g.fillStyle = STATE_COLOUR.wait
            g.beginPath(); g.arc(x + (cx - x) * f, y + (cy - y) * f, mini ? 1.2 : 1.8, 0, 7); g.fill()
          }
          const f = (t * 0.8 + spot.phase) % 1
          g.globalAlpha = 1 - f
          g.strokeStyle = STATE_COLOUR.wait; g.lineWidth = 1.5
          g.beginPath(); g.arc(x, y, size + 2 + f * (mini ? 8 : 15), 0, 7); g.stroke()
          g.globalAlpha = 1
        }
        glowOrb(g, x, y, size, c, row.state === 'rest' ? 0.5 : 1)
        g.globalAlpha = row.state === 'rest' ? 0.5 : 1
        g.strokeStyle = STATE_COLOUR[row.state]; g.lineWidth = 1.5
        g.beginPath(); g.arc(x, y, size + 2.5, 0, 7); g.stroke()
        g.globalAlpha = 1
        if (!mini && row.state !== 'rest') {
          g.fillStyle = row.state === 'wait' ? '#ffd9a0' : '#c9d0de'
          g.font = '10px Segoe UI, sans-serif'; g.textAlign = 'center'
          const name = row.entry.name.length > 14 ? row.entry.name.slice(0, 13) + '…' : row.entry.name
          g.fillText(name, x, y + size + 14)
        }
        out.push({ row, x, y, r: size + 6 })
      }
      placed.current = out
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [mini])

  const find = (e: React.MouseEvent) => {
    const b = canvas.current!.getBoundingClientRect()
    const x = e.clientX - b.left, y = e.clientY - b.top
    return placed.current.find((p) => Math.hypot(p.x - x, p.y - y) < p.r) ?? null
  }
  const onMove = (e: React.MouseEvent) => {
    if (mini) return
    const p = find(e)
    hover.current = p?.row.key ?? null
    const el = tip.current
    if (!el) return
    if (!p) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.style.left = `${Math.min(p.x + 10, (canvas.current?.clientWidth ?? 300) - 170)}px`
    el.style.top = `${p.y + 12}px`
    el.textContent = `${p.row.entry.name} · ${p.row.projectName}`
  }
  const onLeave = () => { hover.current = null; if (tip.current) tip.current.style.display = 'none' }
  const onClick = (e: React.MouseEvent) => {
    if (mini) return
    const p = find(e)
    if (p) onPick?.(p.row.key)
  }

  return (
    <div className={`sky${mini ? ' mini' : ''}`} style={{ height }}>
      <canvas ref={canvas} onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick} style={{ cursor: mini ? 'pointer' : undefined }} aria-label="Your agents circling you: the closer, the more they need you" role="img" />
      {!mini && <div ref={tip} className="skytip" />}
    </div>
  )
}
