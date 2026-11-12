import { DEPARTMENTS, type Department } from './hallLayout'
import { SEAT_SHAPES, hashString } from './bayShapes'
import type { Project } from './projects'
import { seatClip, type AnyVariant, type RobotClip, type RobotVariant } from './robotVariants'
import { seatsFor } from './seats'
import type { RosterEntry, RosterState } from './live/wire'

// The crew of a project: which agent sits at which desk, in what state, as which robot shape. Pure logic, no 3D.
// A live project seats the entries of its roster that work or wait for you; the ones asleep or standing by rest in the rest docks (restDocks.ts). A demo project, or a live
// one from a service without a roster, seats working robots from its counts, with no agent behind them.

export type CrewState = RosterState

export type SeatSlot = { state: 'empty' } | { state: CrewState; entry: RosterEntry | null }

export interface BayCrew {
  /** One slot per desk of the bay. */
  seats: SeatSlot[]
  /** Agents that belong in this bay but do not fit its desks. */
  more: number
  /** All seated agents of this bay. */
  total: number
  /** The same agents counted by state. */
  counts: Record<CrewState, number>
}

const EMPTY: SeatSlot = { state: 'empty' }
const countStates = (states: CrewState[]): Record<CrewState, number> => ({
  running: states.filter((s) => s === 'running').length,
  'needs-you': states.filter((s) => s === 'needs-you').length,
  idle: states.filter((s) => s === 'idle').length,
  standby: states.filter((s) => s === 'standby').length,
})

export function crewFor(project: Project, seatCount: number): Record<Department, BayCrew> {
  const roster = project.live?.roster
  return Object.fromEntries(
    DEPARTMENTS.map((d) => {
      if (!roster) {
        const seats: SeatSlot[] = seatsFor(project.agents[d], seatCount).map((s) => (s === 'robot' ? { state: 'running' as const, entry: null } : EMPTY))
        const working = seats.filter((s) => s.state !== 'empty').length
        return [d, { seats, more: 0, total: working, counts: countStates(Array<CrewState>(working).fill('running')) }]
      }
      const mine = roster.filter((r) => r.seated && r.department === d && (r.state === 'running' || r.state === 'needs-you'))
      const seats: SeatSlot[] = Array.from({ length: seatCount }, (_, i) => (mine[i] ? { state: mine[i].state, entry: mine[i] } : EMPTY))
      return [d, { seats, more: Math.max(0, mine.length - seatCount), total: mine.length, counts: countStates(mine.map((r) => r.state)) }]
    }),
  ) as Record<Department, BayCrew>
}

/** The robot shape of an agent: the same agent always gets the same one, whichever desk it sits at. */
export function crewShape(entry: RosterEntry): AnyVariant {
  return SEAT_SHAPES[hashString(`${entry.agent}:${entry.name.toLowerCase()}`) % SEAT_SHAPES.length]
}

/** A stable animation seed for an agent (colours and timing differ from robot to robot). */
export function crewSeed(entry: RosterEntry): number {
  return (hashString(entry.id) % 997) + 1
}

/** What the robot does: works at its desk, waves when it needs you, otherwise sits calmly (asleep or standing by). */
export function clipForCrew(state: CrewState, job: RobotVariant, seed: number): RobotClip {
  if (state === 'running') return seatClip(job, seed)
  if (state === 'needs-you') return 'wave'
  return 'idle'
}

/** How the eyes look: lit, dim (asleep) or off (standing by). */
export function eyeMood(state: CrewState): 'bright' | 'asleep' | 'off' {
  return state === 'idle' ? 'asleep' : state === 'standby' ? 'off' : 'bright'
}

export interface CrewSummary {
  total: number
  working: number
  waiting: number
  asleep: number
  standby: number
}

/** Counts for the tabs and the panel, or null when the project has no roster (demo data). */
export function crewSummary(project: Project): CrewSummary | null {
  const roster = project.live?.roster
  if (!roster) return null
  const seated = roster.filter((r) => r.seated)
  const count = (s: CrewState) => seated.filter((r) => r.state === s).length
  return { total: seated.length, working: count('running'), waiting: count('needs-you'), asleep: count('idle'), standby: count('standby') }
}

/** A few words for the bubble over a bay, e.g. "1 working · 2 asleep". */
export function bayLabel(bay: BayCrew): string {
  const c = bay.counts
  const parts = [c['needs-you'] > 0 ? '! needs you' : null, c.running > 0 ? `${c.running} working` : null, c.idle > 0 ? `${c.idle} asleep` : null, c.standby > 0 ? `${c.standby} standing by` : null]
  const text = parts.filter((p) => p !== null).join(' · ')
  return text || 'idle'
}

const STATE_WORDS: Record<CrewState, string> = { running: 'working', 'needs-you': 'waiting for you', idle: 'asleep', standby: 'standing by' }
export const stateLabel = (state: CrewState): string => STATE_WORDS[state]

const BASIS_WORDS: Record<RosterEntry['departmentBasis'], string> = {
  activity: 'bay from what it did',
  name: 'bay guessed from its name',
  description: 'bay guessed from its description',
  tools: 'bay guessed from its tools',
  unknown: 'bay unknown, put in Planning',
}
/** How the bay of an agent was decided. Anything but its own activity is a guess and is called one. */
export const basisLabel = (basis: RosterEntry['departmentBasis']): string => BASIS_WORDS[basis]

/** One line about a crew for the project tabs, e.g. "4 agents · 1 working". */
export function crewLine(c: CrewSummary): string {
  if (c.total === 0) return 'no agents'
  const head = `${c.total} agent${c.total === 1 ? '' : 's'}`
  const doing = [c.working > 0 ? `${c.working} working` : null, c.waiting > 0 ? `${c.waiting} waiting for you` : null].filter((p) => p !== null)
  if (doing.length > 0) return `${head} · ${doing.join(', ')}`
  return `${head} · ${c.asleep > 0 ? 'resting' : 'standing by'}`
}

const TOOL_WORDS: [RegExp, string][] = [
  [/^(edit|write|multiedit|notebookedit|apply_patch|replace_string_in_file|insert_edit_into_file|create_file|edit_file)$/i, 'editing files'],
  [/^(read|grep|glob|ls|read_file|list_dir|file_search|grep_search|semantic_search|search|view_image)$/i, 'reading code'],
  [/^(bash|shell|shell_command|powershell|exec_command|local_shell|run_in_terminal|terminal|run_command)$/i, 'running a command'],
  [/^(task|agent|runsubagent)$/i, 'handing work to a subagent'],
  [/^(websearch|webfetch|fetch|web)$/i, 'searching the web'],
  [/^(todowrite|todoread|update_plan)$/i, 'updating its plan'],
]
const MAX_TITLE = 60

/** What a working or waiting agent is doing, in plain words: its tool, then the title its session wrote. Null for an agent that is asleep or standing by. */
export function workLine(entry: RosterEntry): string | null {
  if (entry.state !== 'running' && entry.state !== 'needs-you') return null
  const tool = entry.currentTool
  let doing: string | null = null
  if (tool) {
    const server = /^mcp__([^_].*?)__/.exec(tool)?.[1]
    doing = server ? `using ${server}` : (TOOL_WORDS.find(([re]) => re.test(tool))?.[1] ?? `using ${tool}`)
  }
  // the description of an agent file says what the agent is for, not what it works on now
  const about = entry.role === 'definition' ? null : entry.description
  const title = about && about.length > MAX_TITLE ? about.slice(0, MAX_TITLE - 1).trimEnd() + '…' : about
  const text = [doing, title].filter((p): p is string => !!p).join(' · ')
  return text || null
}
