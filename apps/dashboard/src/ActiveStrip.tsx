import { activeNow } from './activeNow'
import type { Project } from './projects'
import type { RosterEntry } from './live/wire'

/** "Active now": one chip for each real agent that is working or waiting for you. Click one to open its details. */
export default function ActiveStrip({ project, onPick }: { project: Project; onPick: (entry: RosterEntry) => void }) {
  const list = activeNow(project)
  if (list.length === 0) return null
  return (
    <div className="active-strip" role="list" aria-label="Active now">
      <span className="as-title">Active now</span>
      {list.map((a) => (
        <button key={a.entry.id} role="listitem" className={a.waiting ? 'as-chip waiting' : 'as-chip'} onClick={() => onPick(a.entry)} title={a.line ?? a.entry.stateNote}>
          <i />
          <b>{a.entry.name}</b>
          <small>{a.waiting ? 'waiting for you' : (a.line ?? 'working')}</small>
        </button>
      ))}
    </div>
  )
}
