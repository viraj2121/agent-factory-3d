import { useEffect, useState } from 'react'
import { stateLabel, workLine } from './crew'
import { timeAgo } from './live/liveProjects'
import type { RosterEntry } from './live/wire'
import type { Project } from './projects'
import { docLink, groupDocs, sizeText } from './libraryDocs'

const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

function Head({ title, project, onClose }: { title: string; project: Project; onClose: () => void }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <span className="panel-sub" style={{ color: project.accent }}>{project.name}</span>
      </div>
      <button className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
    </div>
  )
}

const ORDER: Record<RosterEntry['state'], number> = { 'needs-you': 0, running: 1, idle: 2, standby: 3 }

/** Every agent of the project in one list, waiting and working first. Click one for its details. */
export function CrewTabPanel({ project, onPick, onClose }: { project: Project; onPick: (e: RosterEntry) => void; onClose: () => void }) {
  const roster = project.live?.roster
  const list = roster ? roster.filter((r) => r.seated).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name)) : null
  return (
    <aside className="panel" aria-label="Crew">
      <Head title="Crew" project={project} onClose={onClose} />
      {!list ? (
        <p className="panel-demo">Demo data from the look test. No real agents are connected.</p>
      ) : list.length === 0 ? (
        <p className="info-sub">No agents have run in this project yet.</p>
      ) : (
        <ul>
          {list.map((r) => (
            <li key={r.id} className="info-row">
              <button className="crew-pick" onClick={() => onPick(r)}>
                <i className={`crew-state ${r.state}`} />
                <b>{r.name}</b>
                <span className="info-sub">{stateLabel(r.state)}</span>
                {workLine(r) && <span className="info-sub now">{workLine(r)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="info-sub info-foot">Click an agent for its details. Working and waiting are inferred from timing.</p>
    </aside>
  )
}

/**
 * The library: the project's markdown files (READMEs, notes, design docs), by folder. Each one opens in VS Code. Only the
 * names, sizes and dates are known: the files themselves are never read by the hub.
 */
export function LibraryPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const now = useNow()
  const live = project.live
  const docs = live?.docs ?? []
  const groups = groupDocs(docs)
  return (
    <aside className="panel" aria-label="Library">
      <Head title="Library" project={project} onClose={onClose} />
      {!live ? (
        <p className="panel-demo">Demo data from the look test. No project folder is connected.</p>
      ) : docs.length === 0 ? (
        <p className="info-sub">No markdown files found in this project (the files that steer agents, such as CLAUDE.md and skills, are not listed here).</p>
      ) : (
        <>
          <p className="info-sub">{docs.length}{live.docsTruncated ? '+' : ''} markdown file{docs.length === 1 ? '' : 's'}{live.docsTruncated ? ' (the list is cut)' : ''}</p>
          {groups.map((g) => (
            <section key={g.folder} className="doc-group">
              <h3>{g.folder || 'Project folder'}</h3>
              <ul>
                {g.files.map((f) => (
                  <li key={f.path} className="doc-row">
                    <a className="doc-open" href={docLink(live.path, f.path)} title={`Open ${f.path} in VS Code`}>
                      <b>{f.name}</b>
                      <span className="info-sub">{sizeText(f.bytes)} · {timeAgo(f.modifiedAt, now)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <p className="info-sub info-foot">Click a file to open it in VS Code. Only names, sizes and dates are read, never the contents.</p>
    </aside>
  )
}

/** The project's sessions, newest first: who did something lately, and what tool it used. Names, tools and times only. */
export function ActivityPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const now = useNow()
  const sessions = project.live ? [...project.live.sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt) : null
  return (
    <aside className="panel" aria-label="Activity">
      <Head title="Activity" project={project} onClose={onClose} />
      {!sessions ? (
        <p className="panel-demo">Demo data from the look test. No real sessions are connected.</p>
      ) : sessions.length === 0 ? (
        <p className="info-sub">No sessions in the days the service reads. Nothing is running.</p>
      ) : (
        <ul>
          {sessions.map((s) => (
            <li key={s.id} className="info-row">
              <div><b>{s.title ?? s.agentLabel}</b></div>
              <div className="info-sub">{s.agentLabel} · {s.state} · {timeAgo(s.lastActivityAt, now)}</div>
              {s.currentTool && <div className="info-sub now">tool: {s.currentTool}</div>}
            </li>
          ))}
        </ul>
      )}
      <p className="info-sub info-foot">Only titles, tool names and times, never the messages.</p>
    </aside>
  )
}
