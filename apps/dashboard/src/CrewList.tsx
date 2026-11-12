import { basisLabel, stateLabel, workLine } from './crew'
import { DEPARTMENT_NAMES } from './DepartmentPanel'
import { timeAgo } from './live/liveProjects'
import type { RosterEntry } from './live/wire'

const ROLE: Record<RosterEntry['role'], string> = { definition: 'agent file', session: 'session', subagent: 'subagent' }

/** One line per agent: name, state, where it comes from, and (for an agent that has not run) how its bay was guessed. */
export default function CrewList({ entries, now, showBay = false }: { entries: RosterEntry[]; now: number; showBay?: boolean }) {
  return (
    <ul>
      {entries.map((r) => (
        <li key={r.id} className="info-row" title={r.stateNote}>
          <div>
            <b>{r.name}</b>
            <span className={`pill ${r.state === 'idle' ? 'asleep' : r.state}`}>{stateLabel(r.state)}</span>
            {r.source === 'hook' && <span className="pill hook" title="This agent reported itself through the hook endpoint.">reported by hook</span>}
            {!r.seated && <span className="pill idle" title="Defined for your whole account. It gets a seat in a project once it has run there.">account-level, no seat</span>}
          </div>
          <div className="info-sub">
            {r.agentLabel} · {ROLE[r.role]}
            {r.model ? ` · ${r.model}` : ''}
            {r.runs > 0 ? ` · ${r.runs} run${r.runs > 1 ? 's' : ''}` : ''}
            {r.lastSeenAt !== null ? ` · ${timeAgo(r.lastSeenAt, now)}` : ' · no run seen'}
          </div>
          {workLine(r) && <div className="info-sub now">Now: {workLine(r)}</div>}
          {r.description && <div className="info-sub">{r.description}</div>}
          <div className="info-sub">
            {showBay ? `${DEPARTMENT_NAMES[r.department]} · ` : ''}
            {basisLabel(r.departmentBasis)}
            {r.definedIn ? ` · ${r.definedIn.split(/[\\/]/).slice(-3).join('/')}` : ''}
          </div>
        </li>
      ))}
    </ul>
  )
}
