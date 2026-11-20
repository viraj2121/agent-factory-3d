import { useEffect, useMemo, useRef, useState } from 'react'
import { useLive } from '../live/useLive'
import { projectsFromSnapshot } from '../live/liveProjects'
import { agoText, vscodeUrl } from '../crewDetails'
import { waitingText, type ToolFilter } from '../inbox'
import { MOON_LOOK } from '../systemLayout'
import { hashString } from '../bayShapes'
import { filterRows, widgetCounts, widgetRows, type WidgetRow, type WidgetState } from '../widgetRows'
import { FigureStage, type Figure } from './figures'

// The desktop widget: a small always-on-top window (Edge in app mode, pinned by start-widget.cmd) that lists every agent
// session on this computer. Read-only. It shows live data only: with the service off it says so, never demo data.

const FIG_W = 54
const FIG_H = 64
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

function Row({ stage, row, now }: { stage: FigureStage; row: WidgetRow; now: number }) {
  const colour = toolColour(row.entry.agent)
  const hallUrl = `/?project=${encodeURIComponent(row.projectId)}`
  return (
    <div className={`row ${row.state}${row.stale ? ' old' : ''}`}>
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
      <div className="meta">{timeText(row, now)}</div>
      <div className="acts">
        {row.folder && <a href={vscodeUrl(row.folder)} title="Opens the project folder in VS Code">Open in VS Code</a>}
        <a href={hallUrl} target="_blank" rel="noreferrer" title="Opens the 3D hall of this project">Show in hall</a>
      </div>
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
  const [compact, setCompact] = useState(() => localStorage.getItem('widget.compact') === '1')
  useEffect(() => localStorage.setItem('widget.compact', compact ? '1' : '0'), [compact])

  // live data only: no demo projects in the widget
  const projects = useMemo(() => (live.state === 'live' && live.snapshot ? projectsFromSnapshot(live.snapshot) : []), [live.state, live.snapshot])
  const rows = useMemo(() => widgetRows(projects, now), [projects, now])
  const counts = widgetCounts(rows)
  const shown = filterRows(rows, { state: tab, tool, query })
  const toolsPresent = TOOLS.filter((t) => t.id === 'all' || rows.some((r) => r.entry.agent === t.id))

  // the window title carries the waiting count, so the taskbar shows it too
  useEffect(() => {
    document.title = counts.wait > 0 ? `Agents (${counts.wait} waiting)` : 'Agents'
  }, [counts.wait])

  const offline = live.state === 'offline'
  const connecting = live.state === 'connecting'
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
        <button className="ib" onClick={() => setCompact((c) => !c)} title={compact ? 'Roomy rows' : 'Compact rows'} aria-label="Toggle compact rows">{compact ? '▤' : '☰'}</button>
      </header>

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
                {list.map((r) => <Row key={r.key} stage={stage} row={r} now={now} />)}
              </section>
            )
          })
        )}
      </main>

      <footer className="foot">
        <a className="main" href="/" target="_blank" rel="noreferrer">Open 3D hall</a>
        <span className="sp" />
        <small>Read-only · this computer · states inferred</small>
      </footer>
    </div>
  )
}
