import type { Project } from './projects'
import { planetFacts } from './planetFacts'
import { timeAgo } from './live/liveProjects'

const STATUS = { working: 'agents working', needs: 'waiting for you', resting: 'resting' } as const

/**
 * The card for the planet you looked closer at: its real facts (what is running, how much is planned, how many files, how
 * long since it was active) and the way in. A demo project shows only what it really has; the rest is marked unknown.
 */
export default function PlanetCard({ project, onEnter, onBack }: { project: Project; onEnter: () => void; onBack: () => void }) {
  const now = Date.now()
  const f = planetFacts(project, now)
  return (
    <aside className="planet-card" aria-label={`${project.name} details`}>
      <h3>{project.name}</h3>
      <div className="pc-row"><span>Status</span><b className={f.status}>{STATUS[f.status]}</b></div>
      <div className="pc-row"><span>Agents working</span><b>{f.working}</b></div>
      {f.waiting > 0 && <div className="pc-row"><span>Waiting for you</span><b className="needs">{f.waiting}</b></div>}
      <div className="pc-row"><span>Plan</span><b>{f.plan === null ? 'unknown' : `${Math.round(f.plan * 100)}%`}</b></div>
      <div className="pc-row"><span>Markdown files</span><b>{f.files === null ? 'unknown (demo)' : f.files}</b></div>
      <div className="pc-row"><span>MCP servers</span><b>{f.mcp === null ? 'unknown (demo)' : f.mcp}</b></div>
      <div className="pc-row"><span>Last activity</span><b>{f.lastActivityAt === null ? 'unknown' : timeAgo(f.lastActivityAt, now)}</b></div>
      <div className="pc-buttons">
        <button className="pc-go" onClick={onEnter}>Enter the hall ›</button>
        <button onClick={onBack}>Back to the system (Esc)</button>
      </div>
    </aside>
  )
}
