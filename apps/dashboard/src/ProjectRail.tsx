import { crewLine, crewSummary } from './crew'
import type { Project } from './projects'
import { useProjects } from './projectsContext'
import { railGroups } from './rail'
import { uiStore, useUi } from './uiSettings'

/**
 * The projects as a rail on the left, grouped by what they need from you (needs you, working, resting), one line
 * each with two small counts: agents waiting for you (amber) and working (green). Folds to a strip of dots ( [ key ).
 * Picking another project flies to its island and swaps the hub.
 */
export default function ProjectRail({ current, busy, onPick }: { current: Project; busy: boolean; onPick: (id: string) => void }) {
  const projects = useProjects()
  const open = useUi().railOpen
  const groups = railGroups(projects)
  return (
    <nav className={open ? 'rail open' : 'rail'} aria-label="Projects">
      <div className="rail-head">
        {open && <span>Projects</span>}
        <button className="rail-fold" onClick={() => uiStore.set({ railOpen: !open })} aria-label={open ? 'Fold the project list ( [ )' : 'Unfold the project list ( [ )'} title={open ? 'Fold  [' : 'Unfold  ['}>
          {open ? '‹' : '›'}
        </button>
      </div>
      <div className="rail-list">
        {groups.map((g) => (
          <div key={g.id} className="rail-group">
            {open && <div className="rail-label">{g.label}</div>}
            {g.items.map(({ project: p, waiting, working }) => {
              const crew = crewSummary(p)
              const hint = `${p.name}${p.live?.path ? `\n${p.live.path}` : p.source === 'demo' ? '\ndemo project' : ''}${crew ? `\n${crewLine(crew)}` : ''}`
              return (
                <button
                  key={p.id}
                  className={p.id === current.id ? 'rail-item on' : 'rail-item'}
                  style={{ ['--accent' as string]: p.accent }}
                  disabled={busy}
                  aria-current={p.id === current.id ? 'page' : undefined}
                  title={hint}
                  onClick={() => p.id !== current.id && onPick(p.id)}
                >
                  <i className={`dot ${p.status}`} />
                  {open && <span className="rail-name">{p.name}</span>}
                  {open && waiting > 0 && <span className="rail-count need" title={`${waiting} waiting for you`}>{waiting}</span>}
                  {open && working > 0 && <span className="rail-count run" title={`${working} working`}>{working}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
