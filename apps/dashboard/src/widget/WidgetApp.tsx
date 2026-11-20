import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLive } from '../live/useLive'
import { projectsFromSnapshot } from '../live/liveProjects'
import { agoText, crewDetails, vscodeUrl } from '../crewDetails'
import { waitingText, type ToolFilter } from '../inbox'
import type { Project } from '../projects'
import { filterRows, widgetCounts, widgetRows, type WidgetRow, type WidgetState } from '../widgetRows'
import OrbitSky, { toolColour } from './OrbitSky'
import { opacityFor } from './orbit'
import { changeWindow, openHall, type WindowAnswer } from './windowApi'

// The desktop widget: a small window (Edge in app mode, opened and pinned by start-widget.cmd) that lists every agent session
// on this computer. Read-only. Live data only: with the service off it says so, never demo data. At the top the Orbit: you
// in the middle, your agents circling you, the closer the more they need you. The window can be pinned on top, it fades
// when left alone (and comes back when an agent starts waiting), and it docks into a small tab at the right edge of the screen
// (scripts/widget-tab.ps1, drawn by Windows: the widget hides and the tab brings it back).

const SKY_H = 190
const TOOLS: { id: ToolFilter; label: string }[] = [
  { id: 'all', label: 'All tools' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'other', label: 'Other' },
]
const GROUPS: { state: WidgetState; label: string }[] = [
  { state: 'wait', label: 'Waiting for you' },
  { state: 'run', label: 'Working' },
  { state: 'rest', label: 'Resting' },
]
const stored = (key: string, fallback: string) => localStorage.getItem(`widget.${key}`) ?? fallback

/** The app's mark: you in the middle, one agent on its orbit. */
export function OrbitMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="mk-core" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" /><stop offset=".45" stopColor="#ffd08a" /><stop offset="1" stopColor="#ff9a3c" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#141a2b" />
      <ellipse cx="16" cy="16" rx="12" ry="7.5" fill="none" stroke="#9cc7ff" strokeOpacity=".55" strokeWidth="1.2" transform="rotate(-24 16 16)" />
      <circle cx="16" cy="16" r="7" fill="url(#mk-core)" />
      <circle cx="26" cy="11.3" r="2.6" fill="#4ee7a0" />
    </svg>
  )
}

function timeText(row: WidgetRow, now: number): string {
  if (row.state === 'wait') return waitingText(row.sinceMs)
  if (row.entry.lastSeenAt === null) return ''
  return row.state === 'run' && row.sinceMs !== null && row.sinceMs < 60_000 ? 'now' : agoText(row.entry.lastSeenAt, now)
}

function Row({ row, now, project, open, onToggle, onHall }: { row: WidgetRow; now: number; project: Project | undefined; open: boolean; onToggle: () => void; onHall: (projectId: string) => void }) {
  const colour = toolColour(row.entry.agent)
  const details = open && project ? crewDetails(row.entry, project, now) : null
  return (
    <div id={`row-${row.key}`} className={`row ${row.state}${row.stale ? ' old' : ''}${open ? ' open' : ''}`}>
      <button className="rowhit" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details of ${row.entry.name}`} />
      <span className="orb" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0, ${colour} 35%, #171222 100%)`, boxShadow: `0 0 10px ${colour}66` }}>
        <span className={`st ${row.state}`} />
      </span>
      <div className="main">
        <div className="nm">
          <span className="name">{row.entry.name}</span>
          <span className="tag" style={{ color: colour, borderColor: `${colour}88` }}>{row.entry.agentLabel}</span>
        </div>
        <div className="what">{row.line}{row.detail ? ` · ${row.detail}` : ''}</div>
        <div className="proj">{row.projectName}</div>
      </div>
      <div className="meta">{timeText(row, now)}<span className="chev" aria-hidden="true">{open ? '▴' : '▾'}</span></div>
      {details ? (
        <div className="details">
          <div className="dtitle">{details.title}</div>
          <div className="dkind">{details.kind}</div>
          <dl>
            {details.rows.map((d) => (
              <div key={d.label} className="drow"><dt>{d.label}</dt><dd>{d.value}</dd></div>
            ))}
          </dl>
          <div className="dlinks">
            {details.links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            <a href={`/?project=${encodeURIComponent(row.projectId)}`} onClick={(e) => { e.preventDefault(); onHall(row.projectId) }}>Show in the 3D hall</a>
          </div>
          <p className="dnote">Only titles, tool names, counts and times are read, never the messages. States are inferred from timing.</p>
        </div>
      ) : (
        row.state === 'wait' && row.folder && (
          <div className="acts"><a href={vscodeUrl(row.folder)} title="Opens the project folder in VS Code">Open in VS Code</a></div>
        )
      )}
    </div>
  )
}

/** Fades the window when the mouse has left it for a while; solid again on hover or when a new agent starts waiting. */
function useFade(base: string, live: boolean, enabled: boolean, waiting: number) {
  const touch = useRef(Date.now())
  const hovered = useRef(true)
  const alertAt = useRef(-Infinity)
  const sent = useRef(100)
  const broken = useRef(false)
  const lastWaiting = useRef(waiting)
  useEffect(() => {
    if (waiting > lastWaiting.current) alertAt.current = Date.now()
    lastWaiting.current = waiting
  }, [waiting])

  useEffect(() => {
    const poke = () => { touch.current = Date.now() }
    const enter = () => { hovered.current = true; poke() }
    const leave = () => { hovered.current = false; poke() }
    const root = document.documentElement
    root.addEventListener('mouseenter', enter)
    root.addEventListener('mouseleave', leave)
    for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel'] as const) window.addEventListener(ev, poke, { passive: true })
    // back from the edge tab (which makes the window solid): start the count again and say the level once more
    const shown = () => { if (!document.hidden) { poke(); sent.current = -1 } }
    document.addEventListener('visibilitychange', shown)
    return () => {
      document.removeEventListener('visibilitychange', shown)
      root.removeEventListener('mouseenter', enter)
      root.removeEventListener('mouseleave', leave)
      for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel'] as const) window.removeEventListener(ev, poke)
    }
  }, [])

  useEffect(() => {
    if (!live) return
    const tick = () => {
      if (broken.current) return
      const now = Date.now()
      const want = opacityFor({ hovered: hovered.current, sinceTouchMs: now - touch.current, sinceAlertMs: now - alertAt.current, enabled })
      if (want === sent.current) return
      sent.current = want
      // a window not opened by start-widget.cmd cannot fade: stop asking, quietly
      void changeWindow(base, { opacity: want }).then((a) => { if (!a.ok) broken.current = true })
    }
    tick()
    const t = window.setInterval(tick, 700)
    return () => window.clearInterval(t)
  }, [base, live, enabled])
}

export default function WidgetApp() {
  const live = useLive()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])
  const [tab, setTab] = useState<WidgetState | 'all'>('all')
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState<ToolFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [compact, setCompact] = useState(() => stored('compact', '0') === '1')
  const [pinned, setPinned] = useState(() => stored('pin', '1') === '1')
  const [fade, setFade] = useState(() => stored('fade', '1') === '1')
  const [light, setLight] = useState(() => stored('theme', 'dark') === 'light')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => localStorage.setItem('widget.compact', compact ? '1' : '0'), [compact])
  useEffect(() => localStorage.setItem('widget.fade', fade ? '1' : '0'), [fade])
  useEffect(() => {
    localStorage.setItem('widget.theme', light ? 'light' : 'dark')
    document.documentElement.classList.toggle('light', light)
  }, [light])

  // live data only: no demo projects in the widget
  const projects = useMemo(() => (live.state === 'live' && live.snapshot ? projectsFromSnapshot(live.snapshot) : []), [live.state, live.snapshot])
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const rows = useMemo(() => widgetRows(projects, now), [projects, now])
  const counts = widgetCounts(rows)
  const shown = filterRows(rows, { state: tab, tool, query })
  const toolsPresent = TOOLS.filter((t) => t.id === 'all' || rows.some((r) => r.entry.agent === t.id))

  useFade(live.base, live.state === 'live', fade, counts.wait)

  // the window title carries the waiting count, so the taskbar shows it too
  useEffect(() => {
    document.title = counts.wait > 0 ? `Agents (${counts.wait} waiting)` : 'Agents'
  }, [counts.wait])

  const tell = useCallback((answer: WindowAnswer) => setProblem(answer.ok ? null : answer.error), [])

  // the launcher pins the window; if it was unpinned last time, say so to the window once the service answers
  const pinSent = useRef(false)
  useEffect(() => {
    if (pinSent.current || live.state !== 'live' || pinned) return
    pinSent.current = true
    void changeWindow(live.base, { pin: false }).then(tell)
  }, [live.state, live.base, pinned, tell])

  const togglePin = async () => {
    const next = !pinned
    const answer = await changeWindow(live.base, { pin: next })
    tell(answer)
    if (answer.ok) {
      setPinned(next)
      localStorage.setItem('widget.pin', next ? '1' : '0')
    }
  }

  // dock: the widget hides and the edge tab at the right of the screen stands in for it (a click on the tab brings it back);
  // the service refuses when the tab is not running, so the widget can never get lost
  const dock = async () => tell(await changeWindow(live.base, { hide: true }))

  const offline = live.state === 'offline'
  const connecting = live.state === 'connecting'
  const pinButton = (
    <button className={`ib${pinned ? ' on' : ''}`} onClick={togglePin} title={pinned ? 'Pinned: stays on top of other windows. Click to unpin.' : 'Not pinned. Click to keep it on top of other windows.'} aria-pressed={pinned} aria-label="Keep on top">📌</button>
  )

  const pick = (key: string) => {
    setTab('all'); setQuery(''); setTool('all'); setOpen(key)
    requestAnimationFrame(() => document.getElementById(`row-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  return (
    <div className={`widget${compact ? ' compact' : ''}`}>
      <header className="head">
        <OrbitMark />
        <div className="title">
          <b>Agents</b>
          <span className={`conn ${live.state}`}>
            <i />
            {offline ? 'Service not running' : connecting ? 'Connecting…' : live.state === 'off' ? 'Live data is off' : 'This computer · live'}
          </span>
        </div>
        <span className="sp" />
        {pinButton}
        <button className="ib" onClick={() => setLight((l) => !l)} title={light ? 'Switch to the dark look' : 'Switch to the light look'} aria-pressed={light} aria-label="Light or dark look">{light ? '☾' : '☀'}</button>
        <button className={`ib${fade ? ' on' : ''}`} onClick={() => setFade((f) => !f)} title={fade ? 'Fades when you leave it alone (comes back when an agent waits). Click to keep it solid.' : 'Always solid. Click to let it fade when left alone.'} aria-pressed={fade} aria-label="Fade when left alone">◌</button>
        <button className="ib" onClick={() => setCompact((c) => !c)} title={compact ? 'Roomy rows' : 'Compact rows'} aria-label="Toggle compact rows">{compact ? '▤' : '☰'}</button>
        <button className="ib" onClick={dock} title="Dock it into a small tab at the right edge of the screen" aria-label="Dock to the screen edge">⇥</button>
      </header>
      {problem && <div className="problem" role="status">{problem}<button onClick={() => setProblem(null)} aria-label="Dismiss">×</button></div>}

      <OrbitSky rows={rows} onPick={pick} height={SKY_H} />

      <div className="seg" role="tablist" aria-label="Show">
        {(['wait', 'run', 'rest'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} className={`${s}${tab === s ? ' on' : ''}`} onClick={() => setTab((cur) => (cur === s ? 'all' : s))}>
            <b>{counts[s]}</b>
            <span>{s === 'wait' ? 'waiting for you' : s === 'run' ? 'working' : 'resting'}</span>
          </button>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="tools">
          <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents or projects" aria-label="Search agents or projects" />
          {toolsPresent.length > 2 && (
            <select value={tool} onChange={(e) => setTool(e.target.value as ToolFilter)} aria-label="Filter by tool">
              {toolsPresent.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
        </div>
      )}

      <main className="list">
        {offline ? (
          <div className="empty off"><b>The agent service is not running</b>Start it with <code>start-widget.cmd</code> in the project folder.</div>
        ) : connecting ? (
          <div className="empty"><b className="plain">Connecting…</b></div>
        ) : rows.length === 0 ? (
          <div className="empty"><b>Nothing is running</b>No agent has been active lately on this computer.</div>
        ) : shown.length === 0 ? (
          <div className="empty"><b className="plain">No match</b>Nothing fits this filter.</div>
        ) : (
          GROUPS.map((g) => {
            const list = shown.filter((r) => r.state === g.state)
            if (list.length === 0) return null
            return (
              <section key={g.state}>
                <div className="group"><span>{g.label}</span><span>{list.length}</span></div>
                {list.map((r) => (
                  <Row key={r.key} row={r} now={now} project={byId.get(r.projectId)} open={open === r.key} onToggle={() => setOpen((cur) => (cur === r.key ? null : r.key))} onHall={(id) => void openHall(live.base, id)} />
                ))}
              </section>
            )
          })
        )}
      </main>

      <footer className="foot">
        <button className="main" onClick={() => void openHall(live.base)} title="Opens the 3D hall in a full-size window">Open 3D hall</button>
        <span className="sp" />
        <small>Read-only · this computer · click a session or a light for details</small>
      </footer>
    </div>
  )
}
