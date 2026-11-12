import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import HubScene from './HubScene'
import { prewarmSystem } from './SystemWorld'
import ProjectRail from './ProjectRail'
import PlanetCard from './PlanetCard'
import ActiveStrip from './ActiveStrip'
import { pictureMode, usePictureMode } from './pictureMode'
import DepartmentPanel from './DepartmentPanel'
import CrewPanel from './CrewPanel'
import type { RosterEntry } from './live/wire'
import { DEPARTMENTS, type Department } from './hallLayout'
import RobotLineup from './RobotLineup'
import IdleTour from './IdleTour'
import SoundButton from './SoundButton'
import { FLY_EVENT, type FlyRequest } from './HubCamera'
import { HintLine, KeysSheet, LevelSwitch, MiniMap, TabStrip } from './ScreenControls'
import { ActivityPanel, CrewTabPanel, LibraryPanel } from './SidePanels'
import { actionFor, type TabId } from './keymap'
import type { PlaceId } from './places'
import { sound } from './soundEngine'
import { hubCameraFor } from './hubCameraConfig'
import { DEMO_PROJECTS } from './projects'
import { ProjectsContext, findProject } from './projectsContext'
import ProjectInfoPanel from './ProjectInfoPanel'
import SettingsPanel from './SettingsPanel'
import { useSettingsSync } from './live/useSettingsSync'
import { reducedMotion, uiStore, useUi } from './uiSettings'
import { useLive } from './live/useLive'
import { bannerFor, projectsFromSnapshot } from './live/liveProjects'
import { skyCamera } from './skyLayout'
import { planetApproach, planetKind, planetPosition, planetSize, systemCamera, systemTime } from './systemLayout'

const PARAMS = new URLSearchParams(window.location.search)
const SCENE = PARAMS.get('scene')

const fly = (detail: FlyRequest) => window.dispatchEvent(new CustomEvent<FlyRequest>(FLY_EVENT, { detail }))

function hasWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

class LoadErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="message">
          <div>
            <h2>The 3D scene could not load</h2>
            <p>{this.state.error.message}</p>
            <p>Check that the model files are in public/models.</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [webgl] = useState(hasWebGL)
  const live = useLive()
  const projects = useMemo(() => (live.state === 'live' && live.snapshot ? projectsFromSnapshot(live.snapshot) : DEMO_PROJECTS), [live.state, live.snapshot])
  const [projectId, setProjectId] = useState(() => PARAMS.get('project') ?? '')
  const [tab, setTab] = useState<TabId | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  // the planet being looked at closely in the solar system (the camera glides to it, then follows it)
  const [look, setLook] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settings = useSettingsSync(live.state, live.base)
  const ui = useUi()
  useEffect(() => {
    document.body.dataset.blur = ui.glassBlur ? 'on' : 'off'
    document.body.dataset.motion = reducedMotion(ui.motion, !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ? 'reduced' : 'full'
  }, [ui.glassBlur, ui.motion])
  const picture = usePictureMode()
  // H: picture mode on/off (Esc leaves it); [: fold or unfold the project rail. Never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))) return
      if (e.key === 'h' || e.key === 'H') pictureMode.toggle()
      else if (e.key === 'Escape' && pictureMode.get()) pictureMode.set(false)
      else if (e.key === '[') uiStore.set({ railOpen: !uiStore.get().railOpen })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // the level: the hall (with its sky and islands) or the solar system above it
  const [level, setLevel] = useState<'hall' | 'system'>(() => (PARAMS.get('focus') === 'system' ? 'system' : 'hall'))
  const [fade, setFade] = useState(false)
  // draw the planets' surfaces quietly in the background so the first flight up does not stall
  useEffect(() => prewarmSystem(projects), [projects])
  const [selected, setSelected] = useState<Department | null>(null)
  // the robot whose details are open (kept with its project, so switching project closes it)
  const [crew, setCrew] = useState<{ id: string; projectId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const timers = useRef<number[]>([])
  const project = findProject(projects, projectId)
  const projectIdRef = useRef(project.id)
  projectIdRef.current = project.id

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const select = useCallback((d: Department) => {
    setTab(null)
    setSelected(d)
    fly({ view: hubCameraFor(d), ms: 1100 })
  }, [])
  const openCrew = useCallback((entry: RosterEntry) => {
    setTab(null)
    setSelected(null)
    setCrew({ id: entry.id, projectId: projectIdRef.current })
  }, [])
  const closePanel = useCallback(() => {
    setSelected(null)
    fly({ view: hubCameraFor(undefined), ms: 1000 })
  }, [])

  // Up from the hall to the solar system: out to the sky view, fade, then pull back from your own planet.
  const enterSystem = useCallback(() => {
    if (busy || level === 'system') return
    setSelected(null)
    setTab(null)
    setBusy(true)
    fly({ view: skyCamera(), ms: 900 })
    const ids = projects.map((p) => p.id)
    const index = Math.max(0, projects.findIndex((p) => p.id === project.id))
    timers.current.push(
      window.setTimeout(() => setFade(true), 600),
      window.setTimeout(() => {
        setLevel('system')
        const at = planetPosition(index, systemTime())
        fly({ from: planetApproach(at, planetSize(planetKind(ids, project.id), true)), view: systemCamera(projects.length), ms: 2200 })
        setFade(false)
      }, 1100),
      window.setTimeout(() => setBusy(false), 3500),
    )
  }, [busy, level, project.id, projects])

  // Down from the system into a project: fly to its planet, fade, then come into the hall from the sky.
  const enterProject = useCallback(
    (id: string) => {
      if (busy || level !== 'system') return
      const index = projects.findIndex((p) => p.id === id)
      if (index < 0) return
      const ids = projects.map((p) => p.id)
      const at = planetPosition(index, systemTime() + 1.1)
      setSelected(null)
      setLook(null)
      setFollowing(false)
      setBusy(true)
      fly({ view: planetApproach(at, planetSize(planetKind(ids, id), id === project.id)), ms: 1200, lock: true })
      timers.current.push(
        window.setTimeout(() => setFade(true), 900),
        window.setTimeout(() => {
          setProjectId(id)
          const url = new URL(window.location.href)
          url.searchParams.set('project', id)
          url.searchParams.delete('focus')
          window.history.replaceState(null, '', url)
          setLevel('hall')
          fly({ from: skyCamera(), view: hubCameraFor(undefined), ms: 1700 })
          setFade(false)
        }, 1400),
        window.setTimeout(() => setBusy(false), 3300),
      )
    },
    [busy, level, project.id, projects],
  )

  // Look closer: glide in to a planet and show its facts; a second click on it goes into its hall. Esc glides back out.
  const lookAt = useCallback(
    (id: string) => {
      if (busy || level !== 'system') return
      if (look === id) return enterProject(id)
      const index = projects.findIndex((p) => p.id === id)
      if (index < 0) return
      const ids = projects.map((p) => p.id)
      setLook(id)
      setFollowing(false)
      fly({ view: planetApproach(planetPosition(index, systemTime() + 1.1), planetSize(planetKind(ids, id), id === project.id) * 1.5), ms: 1100 })
      timers.current.push(window.setTimeout(() => setFollowing(true), 1200))
    },
    [busy, level, look, projects, project.id, enterProject],
  )
  const lookBack = useCallback(() => {
    setLook(null)
    setFollowing(false)
    fly({ view: systemCamera(projects.length), ms: 1300 })
  }, [projects.length])

  // G goes up to the solar system and, from there, back down into the current project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))) return
      if (e.key === 'g' || e.key === 'G') (level === 'system' ? enterProject(project.id) : enterSystem())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [level, enterProject, enterSystem, project.id])

  // fly to a place of the hall (a bay also opens its panel); one panel tab at a time
  const goPlace = useCallback(
    (id: PlaceId) => {
      if (level !== 'hall' || busy) return
      if ((DEPARTMENTS as readonly string[]).includes(id)) return select(id as Department)
      setSelected(null)
      setCrew(null)
      setTab(id === 'library' ? 'library' : null)
      fly({ view: hubCameraFor(id), ms: 1100 })
    },
    [level, busy, select],
  )
  const openTab = useCallback((t: TabId) => {
    setSelected(null)
    setCrew(null)
    setTab((cur) => (cur === t ? null : t))
  }, [])

  // M sound, T tour, , settings, I C A panels, 1 to 5 places, ? keys, Esc closes the open tab. Never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))) return
      if (e.key === 'Escape') return void (look ? lookBack() : tab && setTab(null))
      if (settingsOpen) return
      const a = actionFor(e.key)
      if (!a) return
      if (a.type === 'place') goPlace(a.id)
      else if (a.type === 'sound') sound.toggle()
      else if (a.type === 'tour') uiStore.set({ tourSeconds: uiStore.get().tourSeconds > 0 ? 0 : 30 })
      else if (a.type === 'settings') setSettingsOpen(true)
      else if (a.type === 'tab') openTab(a.tab)
      else setKeysOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, settingsOpen, goPlace, openTab, look, lookBack])

  // Fly out to the chosen island, fade to dark, swap the hub, then fly in from the sky.
  const pick = useCallback(
    (id: string) => {
      if (level === 'system') return enterProject(id)
      if (busy || id === project.id) return
      setSelected(null)
      setBusy(true)
      fly({ view: skyCamera(), ms: 900, lock: true })
      timers.current.push(
        window.setTimeout(() => setFade(true), 600),
        window.setTimeout(() => {
          setProjectId(id)
          const url = new URL(window.location.href)
          url.searchParams.set('project', id)
          window.history.replaceState(null, '', url)
          fly({ from: skyCamera(), view: hubCameraFor(undefined), ms: 1500 })
          setFade(false)
        }, 1100),
        window.setTimeout(() => setBusy(false), 2700),
      )
    },
    [busy, level, enterProject, project.id, projects],
  )

  if (!webgl) {
    return (
      <div className="message">
        <div>
          <h2>WebGL is not available</h2>
          <p>This look test needs a browser with WebGL2 turned on.</p>
        </div>
      </div>
    )
  }

  return (
    <ProjectsContext.Provider value={projects}>
    <div className="stage">
      <div className="topbar">
        <div className={`badge ${live.state === 'live' ? 'live' : ''}`} data-source={live.state}>{bannerFor(live.state)}</div>
        {SCENE !== 'robots' && <LevelSwitch level={level} busy={busy} onHall={() => enterProject(project.id)} onSystem={enterSystem} />}
      </div>
      {SCENE !== 'robots' && <ProjectRail current={project} busy={busy} onPick={pick} />}
      <LoadErrorBoundary>{SCENE === 'robots' ? <RobotLineup /> : <HubScene project={project} projects={projects} onSelect={select} onCrew={openCrew} onLibrary={() => goPlace('library')} level={level} onEnter={lookAt} followId={following ? look : null} />}</LoadErrorBoundary>
      {crew && crew.projectId === project.id && level === 'hall' && !selected && <CrewPanel entryId={crew.id} project={project} onClose={() => setCrew(null)} />}
      {selected && <DepartmentPanel department={selected} project={project} onClose={closePanel} />}
      {tab === 'info' && !selected && !crew && <ProjectInfoPanel project={project} state={live.state} capabilities={live.snapshot?.capabilities ?? []} onClose={() => setTab(null)} />}
      {level === 'hall' && <ActiveStrip project={project} onPick={openCrew} />}
      {tab === 'crew' && !selected && !crew && <CrewTabPanel project={project} onPick={openCrew} onClose={() => setTab(null)} />}
      {tab === 'activity' && !selected && !crew && <ActivityPanel project={project} onClose={() => setTab(null)} />}
      {tab === 'library' && !selected && !crew && <LibraryPanel project={project} onClose={() => setTab(null)} />}
      {level === 'system' && look && !busy && <PlanetCard project={findProject(projects, look)} onEnter={() => enterProject(look)} onBack={lookBack} />}
      {settingsOpen && <SettingsPanel projects={projects} view={settings.view} error={settings.error} change={settings.change} state={live.state} base={live.base} onClose={() => setSettingsOpen(false)} />}
      {picture && <div className="picture-hint">Picture mode · press H or Esc to bring everything back</div>}
      <div className={fade ? 'fade on' : 'fade'} />
      {SCENE !== 'robots' && (
        <>
          <div className="toolbar">
            <SoundButton />
            <IdleTour blocked={selected !== null || busy || settingsOpen || level === 'system'} />
            <button className="ibtn" data-tip="Picture mode (H)" aria-label="Picture mode" onClick={() => pictureMode.set(true)}>📷</button>
            <button className="ibtn" data-tip="Settings (,)" aria-label="Settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>⚙</button>
          </div>
          {level === 'hall' && <MiniMap onGo={goPlace} />}
          <TabStrip tab={tab} onTab={openTab} />
          <HintLine />
          <button className="ibtn help-btn" data-tip="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setKeysOpen(true)}>?</button>
          <KeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} />
        </>
      )}
    </div>
    </ProjectsContext.Provider>
  )
}
