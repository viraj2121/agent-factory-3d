import { useEffect, useState } from 'react'
import CrewList from './CrewList'
import { bayLabel, crewFor } from './crew'
import { HUB_LAYOUT } from './hubLayout'
import type { Department } from './hallLayout'
import type { Project } from './projects'
import { primaryClip, seatClip, seatJob } from './robotVariants'
import { DEPARTMENTS } from './hallLayout'
import { timeAgo } from './live/liveProjects'

export const DEPARTMENT_NAMES: Record<Department, string> = {
  planning: 'Planning',
  development: 'Development & Integration',
  review: 'Code Review & QA',
}

/** Side panel for the bay you clicked. For a demo project everything in it is demo data; for a live one it lists the real sessions seated in this bay. */
export default function DepartmentPanel({ department, project, onClose }: { department: Department; project: Project; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const count = project.agents[department]
  const needsYou = project.attention === department
  const index = DEPARTMENTS.indexOf(department)
  const real = project.source === 'live'
  const here = (project.live?.sessions ?? []).filter((s) => s.state !== 'ended' && s.state !== 'idle' && (s.department ?? 'planning') === department)
  const roster = project.live?.roster
  const crew = roster ? (roster.filter((r) => r.seated && r.department === department)) : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <aside className="panel" aria-label={`${DEPARTMENT_NAMES[department]} details`}>
      <div className="panel-head">
        <div>
          <h2>{DEPARTMENT_NAMES[department]}</h2>
          <span className="panel-sub" style={{ color: project.accent }}>{project.name}</span>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
      </div>
      {real ? (
        <p className="panel-live">
          {crew
            ? 'Each robot is an agent that exists in this project: a session, a subagent or an agent file. Working or waiting is inferred from timing. Where an agent that has not run sits is a guess, and says so.'
            : 'Each robot is one real agent session, seated by the tool it used last (inferred).'}
        </p>
      ) : (
        <p className="panel-demo">Demo data from the look test. No real agents are connected.</p>
      )}
      {needsYou && <p className="panel-alert">{real ? 'An agent here is waiting for you.' : 'This department is asking for a human (demo).'}</p>}
      {crew ? (
        <>
          <h3>{crew.length === 0 ? 'No agents in this bay' : `${crew.length} agent${crew.length > 1 ? 's' : ''}: ${bayLabel(crewFor(project, HUB_LAYOUT.bays[0].seats.length)[department])}`}</h3>
          <CrewList entries={crew} now={now} />
        </>
      ) : (
        <h3>{count === 0 ? 'No robots at work' : `${count} robot${count > 1 ? 's' : ''} at work`}</h3>
      )}
      {real && !crew && (
        <ul>
          {here.map((s) => (
            <li key={`${s.agent}:${s.id}`}>
              <i className="dot" />
              <span>
                {s.agentLabel} · {s.state === 'needs-you' ? 'waiting for you' : 'working'}
                <br />
                <small className="info-sub">
                  {s.title ?? 'untitled session'}{s.currentTool ? ` · ${s.currentTool}` : ''} · {timeAgo(s.lastActivityAt, Date.now())}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul hidden={real}>
        {Array.from({ length: real ? 0 : count }, (_, i) => (
          <li key={i}>
            <i className="dot" />
            Robot {i + 1} · {needsYou && i === 0 ? 'waving for help' : needsYou ? primaryClip(seatJob(department, i)) : seatClip(seatJob(department, i), index * 3 + i + 1) === 'idle2' ? 'taking a breather' : primaryClip(seatJob(department, i))}
          </li>
        ))}
      </ul>
      <button className="panel-back" onClick={onClose}>Back to overview (Esc)</button>
    </aside>
  )
}
