import { useState } from 'react'
import { inboxWords, toolFilter, waitingText, type InboxItem, type ToolFilter } from './inbox'
import { vscodeUrl } from './crewDetails'
import { MOON_LOOK } from './systemLayout'

const FILTERS: { id: ToolFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'copilot', label: 'Copilot' },
]

const toolColour = (agent: string): string => (MOON_LOOK[agent as keyof typeof MOON_LOOK] ?? MOON_LOOK.other).colour

/**
 * The inbox: a full-height panel listing every agent, in every project, that is waiting for you, the longest wait first.
 * Read-only for now: each row opens the project in VS Code or shows the robot in the hall. The words are inferred from activity
 * (the panel says so) and never name the command or file, because those are never read.
 */
export default function InboxPanel({ items, onShow, onClose }: { items: InboxItem[]; onShow: (item: InboxItem) => void; onClose: () => void }) {
  const [filter, setFilter] = useState<ToolFilter>('all')
  // a filter with no waiting agent left falls back to All, so the list is never empty by accident
  const active = filter !== 'all' && toolFilter(items, filter).length === 0 ? 'all' : filter
  const shown = toolFilter(items, active)
  const count = (f: ToolFilter) => toolFilter(items, f).length
  return (
    <aside className="panel inbox-panel" aria-label="Inbox: waiting for you">
      <div className="panel-head">
        <div>
          <h2>
            Waiting for you {items.length > 0 && <span className="inbox-count">{items.length}</span>}
          </h2>
          <span className="panel-sub">All projects · longest waiting first</span>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
      </div>

      <div className="inbox-filters" role="tablist" aria-label="Filter by tool">
        {FILTERS.filter((f) => f.id === 'all' || count(f.id) > 0 || active === f.id).map((f) => (
          <button key={f.id} role="tab" aria-selected={active === f.id} className={active === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {f.label} <small>{count(f.id)}</small>
          </button>
        ))}
      </div>

      <div className="inbox-list">
        {shown.length === 0 ? (
          <div className="inbox-empty">
            <b>Nothing is waiting for you</b>
            Every agent is working or resting.
          </div>
        ) : (
          shown.map((it) => {
            const words = inboxWords(it.entry)
            const colour = toolColour(it.entry.agent)
            return (
              <div key={it.key} className={it.stale ? 'inbox-item stale' : 'inbox-item'}>
                <i className="inbox-dot" />
                <div className="inbox-main">
                  <div className="inbox-who">
                    <b>{it.entry.name}</b>
                    <span className="inbox-tool" style={{ color: colour, borderColor: colour + '88', background: colour + '22' }}>{it.entry.agentLabel}</span>
                  </div>
                  <div className="inbox-what">{words.headline}</div>
                  {words.detail && <div className="inbox-detail">step: {words.detail}</div>}
                  <div className="inbox-project">{it.projectName}</div>
                </div>
                <div className="inbox-age">{waitingText(it.waitingMs)}</div>
                <div className="inbox-actions">
                  {it.folder && <a href={vscodeUrl(it.folder)} title="Opens the project folder in VS Code">Open in VS Code</a>}
                  <button onClick={() => onShow(it)}>Show in hall</button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className="inbox-foot">
        Inferred from activity: the service cannot see the question itself (message text is never read), so it says what kind of wait this is, not which command or file. You answer in your own tool. Read-only.
      </p>
    </aside>
  )
}
