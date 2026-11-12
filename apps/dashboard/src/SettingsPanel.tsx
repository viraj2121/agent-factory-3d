import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MODES, type Mode } from './quality'
import type { Project } from './projects'
import { sound } from './soundEngine'
import { DEFAULT_UI, TOUR_CHOICES, uiStore, useUi, type LabelMode, type MotionMode } from './uiSettings'
import type { LiveState } from './live/liveProjects'
import { THEMES, THEME_IDS, type ThemeId } from './themes'
import type { Scenery } from './scenery'
import { hidePatch, renamePatch, rootsPatch, showPatch, type SettingsPatch, type SettingsView } from './live/settingsApi'

type Section = 'projects' | 'agents' | 'display' | 'sound' | 'about'
const SECTIONS: { id: Section; icon: string; label: string }[] = [
  { id: 'projects', icon: '◈', label: 'Projects' },
  { id: 'agents', icon: '⚙', label: 'Agents' },
  { id: 'display', icon: '▣', label: 'Display' },
  { id: 'sound', icon: '♪', label: 'Sound & camera' },
  { id: 'about', icon: 'ⓘ', label: 'About' },
]

// ---- small controls

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={on ? 'switch on' : 'switch'} onClick={() => onChange(!on)} />
}

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="set-card">
      <h3>{title}</h3>
      {note && <p className="set-note">{note}</p>}
      {children}
    </section>
  )
}

const NEEDS_SERVICE = <p className="set-empty">These settings are kept by the agent service, which is not running. Start it with <code>start-factory.bat</code> (or <code>npm start</code> in apps/agent-service) and they appear here.</p>

// ---- sections

function ProjectsSection({ projects, view, change }: { projects: Project[]; view: SettingsView | null; change: Change }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  if (!view) return NEEDS_SERVICE
  const shown = projects.filter((p) => p.source === 'live' && p.live)
  const hidden = view.settings.hiddenProjects
  const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
  const save = (path: string) => {
    void change(renamePatch(path, draft))
    setEditing(null)
  }
  return (
    <>
      <Card title={`Shown in the hub (${shown.length})`} note="Hidden projects are left out of the sky and the project tabs. The hub shows at most 8 projects, so hiding one lets the next one in. A new name is for display only: the folder is not touched.">
        <ul className="set-list">
          {shown.map((p) => (
            <li key={p.id}>
              <i className={`dot ${p.status}`} />
              <div className="set-item">
                {editing === p.live!.path ? (
                  <input
                    autoFocus
                    className="set-input"
                    value={draft}
                    placeholder={folderName(p.live!.path)}
                    maxLength={60}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(p.live!.path)
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setEditing(null)
                      }
                    }}
                    onBlur={() => save(p.live!.path)}
                    aria-label={`New name for ${p.name}`}
                  />
                ) : (
                  <b>{p.name}</b>
                )}
                <small>{p.live!.path}</small>
              </div>
              <button
                className="set-btn"
                onClick={() => {
                  setDraft(p.name === folderName(p.live!.path) ? '' : p.name)
                  setEditing(p.live!.path)
                }}
              >
                Rename
              </button>
              <button className="set-btn" onClick={() => void change(hidePatch(view, { path: p.live!.path, name: p.name }))} title="Leave this project out of the sky and the tabs">
                Hide
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="set-empty">No live projects right now.</li>}
        </ul>
      </Card>
      <Card title={`Hidden (${hidden.length})`}>
        <ul className="set-list">
          {hidden.map((h) => (
            <li key={h.path} className="muted">
              <i className="dot" />
              <div className="set-item">
                <b>{h.name}</b>
                <small>{h.path}</small>
              </div>
              <button className="set-btn primary" onClick={() => void change(showPatch(view, h.path))}>
                Show
              </button>
            </li>
          ))}
          {hidden.length === 0 && <li className="set-empty">Nothing hidden.</li>}
        </ul>
      </Card>
    </>
  )
}

function AgentsSection({ view, change, state, base }: { view: SettingsView | null; change: Change; state: LiveState; base: string }) {
  const [folder, setFolder] = useState('')
  if (!view) return NEEDS_SERVICE
  const days = view.settings.days
  const add = async () => {
    if (!folder.trim()) return
    if (await change(rootsPatch(view, { add: folder }))) setFolder('')
  }
  return (
    <>
      <Card title="What the hub reads">
        <Row title="How far back to look" hint={`Sessions and subagent runs older than this are not read. Reading ${view.effectiveDays} days now. Longer makes the first scan slower.`}>
          <Segmented
            label="Days back"
            value={days ?? 0}
            options={[{ value: 0, label: 'Default' }, { value: 1, label: '1 day' }, { value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]}
            onChange={(v) => void change({ days: v === 0 ? null : v })}
          />
        </Row>
      </Card>
      <Card title="Folders to look in" note="Projects with agent setup files (CLAUDE.md, AGENTS.md, .github/agents and so on) are found here, besides the folders next to where agents were used. Up to 4 levels deep.">
        <ul className="set-list">
          {view.settings.roots.map((r) => (
            <li key={r}>
              <span className="set-folder">📁</span>
              <div className="set-item">
                <b>{r}</b>
              </div>
              <button className="set-btn" onClick={() => void change(rootsPatch(view, { remove: r }))} aria-label={`Remove ${r}`}>
                Remove
              </button>
            </li>
          ))}
          {view.settings.roots.length === 0 && <li className="set-empty">No extra folders.</li>}
        </ul>
        <div className="set-add">
          <input className="set-input" value={folder} onChange={(e) => setFolder(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} placeholder="Full folder path, e.g. E:\Code" aria-label="Folder to add" />
          <button className="set-btn primary" onClick={() => void add()}>
            Add folder
          </button>
        </div>
      </Card>
      <Card title="Service">
        <Row title="Agent service" hint={base}>
          <span className={`set-status ${state === 'live' ? 'ok' : ''}`}>{state === 'live' ? 'connected' : state}</span>
        </Row>
        <Row title="Settings file" hint={view.file}>
          <button className="set-btn" onClick={() => void navigator.clipboard?.writeText(view.file)}>
            Copy path
          </button>
        </Row>
        {view.problems.length > 0 && <p className="set-error">The file had problems: {view.problems.join('; ')}</p>}
      </Card>
    </>
  )
}

const QUALITY_LABEL: Record<Mode, string> = { auto: 'Auto', high: 'High', balanced: 'Balanced', fast: 'Fast', lite: 'Lite' }

function DisplaySection() {
  const ui = useUi()
  return (
    <>
      <Card title="Picture">
        <Row title="Quality" hint="Auto lowers the detail by itself when the frame rate stays low. Lite is for computers without a graphics card.">
          <Segmented label="Quality" value={ui.quality} options={MODES.map((m) => ({ value: m, label: QUALITY_LABEL[m] }))} onChange={(quality) => uiStore.set({ quality })} />
        </Row>
        <Row title="Frame-rate counter" hint="The small graph in the top left corner.">
          <Switch label="Frame-rate counter" on={ui.showFps} onChange={(showFps) => uiStore.set({ showFps })} />
        </Row>
        <Row title="Glass blur on panels" hint="Frosted glass behind panels and buttons. Off is a little faster.">
          <Switch label="Glass blur" on={ui.glassBlur} onChange={(glassBlur) => uiStore.set({ glassBlur })} />
        </Row>
      </Card>
      <Card title="Space" note="Every look is real space: a black sky, stars and the Milky Way. Space weather follows the project's status: drifting dust when idle, a meteor shower while agents work, an ion storm over the dome when it needs you. It is decoration.">
        <Row title="Theme">
          <Segmented<ThemeId> label="Theme" value={ui.theme} options={THEME_IDS.map((id) => ({ value: id, label: THEMES[id].label }))} onChange={(theme) => uiStore.set({ theme })} />
        </Row>
        <Row title="Space weather" hint="Off gives a still sky. Lite quality turns it off by itself.">
          <Switch label="Space weather" on={ui.spaceWeather} onChange={(spaceWeather) => uiStore.set({ spaceWeather })} />
        </Row>
      </Card>
      <Card title="Scenery" note="Only the robots, the markers over them and the green and amber of status are real. Everything else is decoration.">
        <Row title="How much decoration" hint="Full: everything moves. Calm: only the cart and two couriers keep walking; no crowd of robots, steam, sparks, dust or drone, so the real agents stand out. Real only: just the hall and the agents.">
          <Segmented<Scenery> label="Scenery" value={ui.scenery} options={[{ value: 'full', label: 'Full' }, { value: 'calm', label: 'Calm' }, { value: 'real', label: 'Real only' }]} onChange={(scenery) => uiStore.set({ scenery })} />
        </Row>
      </Card>
      <Card title="Labels and motion">
        <Row title="Labels in the scene" hint="All: bay bubbles and data tags from afar, agent names up close. Names: only agent names up close. None: a clean picture.">
          <Segmented<LabelMode> label="Labels" value={ui.labels} options={[{ value: 'all', label: 'All' }, { value: 'names', label: 'Names only' }, { value: 'none', label: 'None' }]} onChange={(labels) => uiStore.set({ labels })} />
        </Row>
        <Row title="Motion" hint="Reduced stops the camera tour and the floating z z Z. System follows your computer's setting.">
          <Segmented<MotionMode> label="Motion" value={ui.motion} options={[{ value: 'system', label: 'System' }, { value: 'reduced', label: 'Reduced' }, { value: 'full', label: 'Full' }]} onChange={(motion) => uiStore.set({ motion })} />
        </Row>
      </Card>
    </>
  )
}

function SoundSection() {
  const ui = useUi()
  const on = useSyncExternalStore(sound.subscribe, () => sound.on)
  const volume = useSyncExternalStore(sound.subscribe, () => sound.volume)
  return (
    <>
      <Card title="Sound" note="Made in the browser, no sound files. It always starts off, because browsers only allow sound after a click.">
        <Row title="Sound">
          <Switch label="Sound" on={on} onChange={() => sound.toggle()} />
        </Row>
        <Row title="Volume">
          <input className="set-range" type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => sound.setVolume(Number(e.target.value) / 100)} aria-label="Volume" />
        </Row>
      </Card>
      <Card title="Camera">
        <Row title="Idle tour" hint="When nothing is touched for this long, the camera glides round the hub. Any mouse move or key takes over.">
          <Segmented label="Idle tour" value={ui.tourSeconds} options={TOUR_CHOICES.map((s) => ({ value: s, label: s === 0 ? 'Off' : `${s} s` }))} onChange={(tourSeconds) => uiStore.set({ tourSeconds })} />
        </Row>
      </Card>
    </>
  )
}

function AboutSection({ file }: { file: string | null }) {
  return (
    <>
      <Card title="What the hub does">
        <ul className="set-facts">
          <li>Watches Claude Code, Codex and GitHub Copilot on this computer, read-only. It cannot start, stop or prompt an agent.</li>
          <li>Never reads out message text, tool inputs or results: only titles the agents wrote, tool names, times and counts.</li>
          <li>Working, waiting and asleep are inferred from timing, and the hub says so.</li>
          <li>Tube capsules, belts, the drone and the weather are decoration.</li>
        </ul>
      </Card>
      <Card title="Credits">
        <ul className="set-facts">
          <li>The stars and the Milky Way are NASA/Goddard Space Flight Center Scientific Visualization Studio, "Deep Star Maps 2020", built on data from ESA/Gaia/DPAC.</li>
          <li>The sun, the gas giant, the flare and the aurora are drawn by the page: decoration.</li>
        </ul>
      </Card>
      <Card title="Where settings are kept" note={file ? `Everything here is saved in ${file} (and display choices also in this browser).` : 'Display choices are saved in this browser. With the agent service running they are also kept in its settings file.'}>
        <Row title="Reset display choices" hint="Quality, labels, motion, glass blur, frame-rate counter and the tour go back to their defaults. Hidden projects and names stay.">
          <button className="set-btn" onClick={() => uiStore.replace(DEFAULT_UI)}>
            Reset
          </button>
        </Row>
      </Card>
    </>
  )
}

type Change = (patch: SettingsPatch) => Promise<boolean>

/** The Settings dialog: projects (hide, rename), agents (days, folders), display, sound and camera, about. */
export default function SettingsPanel({
  projects,
  view,
  error,
  change,
  state,
  base,
  onClose,
}: {
  projects: Project[]
  view: SettingsView | null
  error: string | null
  change: Change
  state: LiveState
  base: string
  onClose: () => void
}) {
  const [section, setSection] = useState<Section>('projects')
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dialog.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="settings-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="Settings" ref={dialog} tabIndex={-1}>
        <nav className="settings-nav" role="tablist" aria-label="Settings sections">
          <div className="settings-title">Settings</div>
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={section === s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>
              <span aria-hidden>{s.icon}</span>
              {s.label}
            </button>
          ))}
          <div className="settings-saved">{view ? 'Saved to the settings file' : 'Saved in this browser'}</div>
        </nav>
        <div className="settings-body" role="tabpanel">
          <div className="settings-head">
            <h2>{SECTIONS.find((s) => s.id === section)?.label}</h2>
            <button className="panel-close" onClick={onClose} aria-label="Close settings">
              ×
            </button>
          </div>
          {error && <p className="set-error">Not saved: {error}</p>}
          {section === 'projects' && <ProjectsSection projects={projects} view={view} change={change} />}
          {section === 'agents' && <AgentsSection view={view} change={change} state={state} base={base} />}
          {section === 'display' && <DisplaySection />}
          {section === 'sound' && <SoundSection />}
          {section === 'about' && <AboutSection file={view?.file ?? null} />}
        </div>
      </div>
    </div>
  )
}
