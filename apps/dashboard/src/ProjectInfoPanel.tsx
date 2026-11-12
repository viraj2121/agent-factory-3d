import { useEffect, useState } from 'react'
import CrewList from './CrewList'
import { crewLine, crewSummary } from './crew'
import { DEPARTMENT_NAMES } from './DepartmentPanel'
import { groupHarness, timeAgo, type LiveState } from './live/liveProjects'
import type { AgentCapability, AgentSession, McpServer } from './live/wire'
import type { Project } from './projects'

const STATE_LABEL: Record<AgentSession['state'], string> = { running: 'working', 'needs-you': 'waiting for you', idle: 'idle', ended: 'ended' }
const KIND_LABEL: Record<string, string> = { instructions: 'Instruction files', skill: 'Skills', subagent: 'Subagents', command: 'Slash commands', hook: 'Hooks', plugin: 'Plugins' }
const MCP_STATUS: Record<McpServer['status'], string> = { configured: 'configured', 'needs-auth': 'needs sign-in', 'seen-in-use': 'seen in use (not in a config file)' }

function SessionRow({ s, now }: { s: AgentSession; now: number }) {
  return (
    <li className="info-row">
      <div>
        <b>{s.agentLabel}</b>
        <span className={`pill ${s.state}`} title={s.stateNote}>{STATE_LABEL[s.state]}</span>
        {s.source === 'hook' && <span className="pill hook" title="This agent reported itself through the hook endpoint.">reported by hook</span>}
      </div>
      <div className="info-sub">
        {s.title ?? 'untitled session'}
      </div>
      <div className="info-sub">
        {s.department ? DEPARTMENT_NAMES[s.department] : 'no tool used yet'}
        {s.currentTool ? ` · ${s.currentTool}` : ''}
        {s.model ? ` · ${s.model}` : ''} · {timeAgo(s.lastActivityAt, now)}
      </div>
    </li>
  )
}

function Capabilities({ list }: { list: AgentCapability[] }) {
  if (list.length === 0) return null
  return (
    <>
      <h3>Which agents the hub can see</h3>
      <ul>
        {list.map((c) => (
          <li key={c.agent} className="info-row" title={c.note}>
            <div>
              <b>{c.label}</b>
              <span className={`pill ${c.found && c.observe === 'supported' ? 'running' : 'idle'}`}>{c.agent === 'other' ? (c.found ? 'reporting' : 'none reported yet') : c.found ? (c.observe === 'supported' ? 'watching' : 'found, not readable') : 'not found'}</span>
              <span className="pill idle" title="Starting, stopping or prompting agents from the hub is not built.">control: unsupported</span>
            </div>
            <div className="info-sub">{c.note}</div>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Side panel with what the agent service knows about the project: its agents, MCP servers and harness. */
export default function ProjectInfoPanel({ project, state, capabilities, onClose }: { project: Project; state: LiveState; capabilities: AgentCapability[]; onClose: () => void }) {
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

  const live = project.live
  const sessions = (live?.sessions ?? []).filter((s) => s.state !== 'ended')
  const harness = groupHarness(live?.harness ?? [])

  return (
    <aside className="panel info" aria-label="Project details">
      <div className="panel-head">
        <div>
          <h2>{project.name}</h2>
          <span className="panel-sub" style={{ color: project.accent }}>{live?.path ?? (project.source === 'demo' ? 'demo project' : 'waiting for agents')}</span>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
      </div>

      {project.source === 'demo' ? (
        <p className="panel-demo">
          Demo data from the look test. {state === 'offline' ? 'To see real agents, start the agent service: npm start in apps/agent-service.' : 'Looking for the agent service...'}
        </p>
      ) : (
        <p className="panel-live">Read from agent files on this computer. Working or waiting is inferred from timing, not told by the agent. The hub only watches: it cannot start, stop or prompt an agent.</p>
      )}

      {project.live?.discovered && (
        <p className="info-plan">Found by its agent setup files. No agent has run here in the last 7 days, so there are no robots at work.</p>
      )}

      {project.source === 'live' && project.live && !project.live.discovered && (
        <p className="info-plan">
          {project.planKnown ? `Plan progress ${Math.round(project.progress * 100)}% (from the agent's own task list).` : 'No agent wrote a task list here, so plan progress is unknown. The library and launch pad stay at zero.'}
        </p>
      )}

      {project.source === 'live' && (
        <>
          {live?.roster && (
            <>
              <h3>Crew: {crewSummary(project) ? crewLine(crewSummary(project)!) : 'no agents'}</h3>
              <p className="info-sub">Every agent that exists here: sessions, subagents and agent files. Robots in the bays follow this list. An agent that never ran stands by, in a bay guessed from its name, description or tools.</p>
              <CrewList entries={live.roster} now={now} showBay />
            </>
          )}
          <h3>{sessions.length === 0 ? 'No active agents' : `${sessions.length} agent session${sessions.length > 1 ? 's' : ''}`}</h3>
          <ul>{sessions.map((s) => <SessionRow key={`${s.agent}:${s.id}`} s={s} now={now} />)}</ul>

          <h3>MCP servers ({live?.mcp.length ?? 0})</h3>
          {(live?.mcp.length ?? 0) === 0 && <p className="info-sub">None found in the config files of Claude Code, Codex or VS Code for this project.</p>}
          <ul>
            {live?.mcp.map((m) => (
              <li key={`${m.agent}:${m.scope}:${m.name}`} className="info-row" title={m.target ? `${m.target}\n${m.configFile}` : m.configFile}>
                <div>
                  <b>{m.name}</b>
                  <span className={`pill ${m.status === 'needs-auth' ? 'needs-you' : 'idle'}`}>{MCP_STATUS[m.status]}</span>
                </div>
                <div className="info-sub">
                  {m.agent === 'claude-code' ? 'Claude Code' : m.agent === 'codex' ? 'Codex' : m.agent === 'copilot' ? 'VS Code / Copilot' : m.agent} · {m.scope} · {m.transport}
                  {m.recentCalls > 0 ? ` · ${m.recentCalls} recent call${m.recentCalls > 1 ? 's' : ''}` : ''}
                </div>
              </li>
            ))}
          </ul>

          <h3>Harness ({live?.harness.length ?? 0})</h3>
          {harness.length === 0 && <p className="info-sub">No instruction files, skills, subagents or hooks found.</p>}
          {harness.map(([kind, names]) => (
            <details key={kind} className="info-group" open={kind === 'subagent'}>
              <summary>
                {KIND_LABEL[kind] ?? kind} ({names.length})
              </summary>
              <div className="info-sub">{names.join(', ')}</div>
            </details>
          ))}
        </>
      )}

      <Capabilities list={capabilities} />
      <p className="info-sub info-foot">Belts, the drone and the weather are decoration. Only the robots in the bays, the colours of status and (when an agent wrote a task list) the library and launch pad follow real data.</p>
      <button className="panel-back" onClick={onClose}>Close (Esc)</button>
    </aside>
  )
}
