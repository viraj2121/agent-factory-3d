import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLive } from '../live/useLive'
import { projectsFromSnapshot } from '../live/liveProjects'
import { agoText, crewDetails, vscodeUrl } from '../crewDetails'
import { waitingText, type ToolFilter } from '../inbox'
import { MOON_LOOK } from '../systemLayout'
import { hashString } from '../bayShapes'
import type { Project } from '../projects'
import { filterRows, widgetCounts, widgetRows, type WidgetRow, type WidgetState } from '../widgetRows'
import { FigureStage, type Figure } from './figures'
import { changeWindow } from './windowApi'

// The desktop widget: a small window (Edge in app mode, opened and pinned by start-widget.cmd) that lists every agent session
// on this computer. Read-only. Live data only: with the service off it says so, never demo data. It can be pinned on top or
// not, collapsed to a slim bar and expanded again, and any session opens in place to show its details.

const FIG_W = 54
const FIG_H = 64
/** The height of the collapsed bar, inside the window. */
const BAR_H = 58
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
const toolColour = (agent: string): string => (MOON_LOOK[agent as keyof typeof MOON_LOOK] ?? MOON_LOOK.other).colour
const stored = (key: string, fallback: string) => localStorage.getItem(`widget.${key}`) ?? fallback

/** One row's robot: a canvas the shared stage draws into. */
function RobotFigure({ stage, row }: { stage: FigureStage; row: WidgetRow }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const fig = useRef<Figure | null>(null)
  const { figure, action, state, key } = row
  useEffect(() => {
    if (!ref.current) return
    fig.current = stage.attach(ref.current, figure, action, state, hashString(key))
    return () => {
      if (fig.current) stage.detach(fig.current)
      fig.current = null
    }
    // a new robot only when the agent's look changes; its action and state are updated below
  }, [stage, key, figure.shape, figure.paint, figure.variant])
  useEffect(() => {
    if (fig.current) stage.update(fig.current, action, state)
  }, [stage, action, state])
  return <canvas ref={ref} className="fig" style={{ width: FIG_W, height: FIG_H }} aria-hidden="true" />
}

function timeText(row: WidgetRow, now: number): string {
  if (row.state === 'wait') return waitingText(row.sinceMs)
  if (row.entry.lastSeenAt === null) return ''
  return row.state === 'run' && row.sinceMs !== null && row.sinceMs < 60_000 ? 'now' : agoText(row.entry.lastSeenAt, now)
}

function Row({ stage, row, now, project, open, onToggle }: { stage: FigureStage; row: WidgetRow; now: number; project: Project | undefined; open: boolean; onToggle: () => void }) {
  const colour = toolColour(row.entry.agent)
  const details = open && project ? crewDetails(row.entry, project, now) : null
  return (
    <div className={`row ${row.state}${row.stale ? ' old' : ''}${open ? ' open' : ''}`}>
      <button className="rowhit" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details of ${row.entry.name}`} />
      <div className="figwrap" style={{ background: `radial-gradient(circle at 50% 85%, ${colour}38, transparent 70%)`, borderColor: `${colour}44` }}>
        <RobotFigure stage={stage} row={row} />
        <span className={`st ${row.state}`} />
      </div>
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
            <a href={`/?project=${encodeURIComponent(row.projectId)}`} target="_blank" rel="noreferrer">Show in the 3D hall</a>
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

export default function WidgetApp() {
  const live = useLive()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])
  const [stage] = useState(() => new FigureStage(FIG_W, FIG_H))
  useEffect(() => () => stage.dispose(), [stage])
  const [tab, setTab] = useState<WidgetState | 'all'>('all')
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState<ToolFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [compact, setCompact] = useState(() => stored('compact', '0') === '1')
  const [pinned, setPinned] = useState(() => stored('pin', '1') === '1')
  const [collapsed, setCollapsed] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => localStorage.setItem('widget.compact', compact ? '1' : '0'), [compact])

  // live data only: no demo projects in the widget
  const projects = useMemo(() => (live.state === 'live' && live.snapshot ? projectsFromSnapshot(live.snapshot) : []), [live.state, live.snapshot])
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const rows = useMemo(() => widgetRows(projects, now), [projects, now])
  const counts = widgetCounts(rows)
  const shown = filterRows(rows, { state: tab, tool, query })
  const toolsPresent = TOOLS.filter((t) => t.id === 'all' || rows.some((r) => r.entry.agent === t.id))

  // the window title carries the waiting count, so the taskbar shows it too
  useEffect(() => {
    document.title = counts.wait > 0 ? `Agents (${counts.wait} waiting)` : 'Agents'
  }, [counts.wait])

  const tell = useCallback((answer: { ok: true } | { ok: false; error: string }) => setProblem(answer.ok ? null : answer.error), [])

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

  // collapse to a slim bar and back: the window itself shrinks and grows (the frame around the page is kept)
  // (a window that reports no size, as in some test browsers, is left as it is)
  const sized = () => window.outerWidth > 0 && window.outerHeight > 0
  const collapse = async () => {
    setCollapsed(true)
    if (!sized()) return
    localStorage.setItem('widget.height', String(window.outerHeight))
    tell(await changeWindow(live.base, { width: window.outerWidth, height: Math.max(60, window.outerHeight - window.innerHeight + BAR_H) }))
  }
  const expand = async () => {
    setCollapsed(false)
    if (!sized()) return
    const height = Math.max(320, Number(stored('height', '680')) || 680)
    tell(await changeWindow(live.base, { width: window.outerWidth, height }))
  }

  const offline = live.state === 'offline'
  const connecting = live.state === 'connecting'
  const pinButton = (
    <button className={`ib${pinned ? ' on' : ''}`} onClick={togglePin} title={pinned ? 'Pinned: stays on top of other windows. Click to unpin.' : 'Not pinned. Click to keep it on top of other windows.'} aria-pressed={pinned} aria-label="Keep on top">📌</button>
  )

  if (collapsed) {
    return (
      <div className="bar" title={problem ?? undefined}>
        <span className="logo small" aria-hidden="true">🤖</span>
        <button className="chips" onClick={expand} title="Expand">
          <span className="chip wait"><i />{counts.wait} waiting</span>
          <span className="chip run"><i />{counts.run} working</span>
          {counts.rest > 0 && <span className="chip rest"><i />{counts.rest}</span>}
          {offline && <span className="chip off">service off</span>}
        </button>
        <span className="sp" />
        {pinButton}
        <button className="ib" onClick={expand} title="Expand" aria-label="Expand">⤢</button>
      </div>
    )
  }

  return (
    <div className={`widget${compact ? ' compact' : ''}`}>
      <header className="head">
        <span className="logo" aria-hidden="true">🤖</span>
        <div className="title">
          <b>Agents</b>
          <span className={`conn ${live.state}`}>
            <i />
            {offline ? 'Service not running' : connecting ? 'Connecting…' : live.state === 'off' ? 'Live data is off' : 'This computer · live'}
          </span>
        </div>
        <span className="sp" />
        {pinButton}
        <button className="ib" onClick={() => setCompact((c) => !c)} title={compact ? 'Roomy rows' : 'Compact rows'} aria-label="Toggle compact rows">{compact ? '▤' : '☰'}</button>
        <button className="ib" onClick={collapse} title="Collapse to a slim bar" aria-label="Collapse">⤡</button>
      </header>
      {problem && <div className="problem" role="status">{problem}<button onClick={() => setProblem(null)} aria-label="Dismiss">×</button></div>}

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
                  <Row key={r.key} stage={stage} row={r} now={now} project={byId.get(r.projectId)} open={open === r.key} onToggle={() => setOpen((cur) => (cur === r.key ? null : r.key))} />
                ))}
              </section>
            )
          })
        )}
      </main>

      <footer className="foot">
        <a className="main" href="/" target="_blank" rel="noreferrer">Open 3D hall</a>
        <span className="sp" />
        <small>Read-only · this computer · click a session for details</small>
      </footer>
    </div>
  )
}
