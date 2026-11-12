import { useEffect, useState } from 'react'
import type { Project } from './projects'
import { crewDetails } from './crewDetails'

/**
 * Side panel for the robot you clicked: one real agent (a session, a helper agent or an agent file), with what the agent
 * service knows about it. Titles, tool names, counts and times only. The state is inferred from timing, and says so.
 * "Open in VS Code" is a plain link: the page itself reads and writes nothing.
 */
export default function CrewPanel({ entryId, project, onClose }: { entryId: string; project: Project; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const entry = project.live?.roster.find((r) => r.id === entryId)
  if (!entry) return null
  const d = crewDetails(entry, project, now)

  return (
    <aside className="panel crew-panel" aria-label={`${d.title} details`}>
      <div className="panel-head">
        <div>
          <h2>{d.title}</h2>
          <span className="panel-sub" style={{ color: project.accent }}>{project.name}</span>
          <div className="crew-kind"><i className={`crew-state ${entry.state}`} />{d.kind}</div>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
      </div>
      <dl className="crew-dl">
        {d.rows.map((r) => (
          <div key={r.label} className="crew-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {d.links.map((l) => (
        <a key={l.href} className="crew-link" href={l.href}>{l.label} ↗</a>
      ))}
      <p className="info-sub info-foot">Only titles, tool names, counts and times are read, never the messages. Working and waiting are inferred from timing.</p>
    </aside>
  )
}
