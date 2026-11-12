import { useEffect, useState } from 'react'
import { KEYS_SHEET, OTHER_KEYS, type TabId } from './keymap'
import { PLACES, mapPoint, type PlaceId } from './places'

/** Hall or solar system: a two-way switch next to the banner, so it also says where you are. */
export function LevelSwitch({ level, busy, onHall, onSystem }: { level: 'hall' | 'system'; busy: boolean; onHall: () => void; onSystem: () => void }) {
  return (
    <span className="seg level-switch" role="group" aria-label="Level">
      <button className={level === 'hall' ? 'on' : ''} disabled={busy} onClick={() => level !== 'hall' && onHall()} title="The hall of this project (G)">Hall</button>
      <button className={level === 'system' ? 'on' : ''} disabled={busy} onClick={() => level !== 'system' && onSystem()} title="The solar system of all your projects (G)">System</button>
    </span>
  )
}

/** A top-down drawing of the hall. Every place is a dot; click one to fly there. Replaces six text buttons. */
export function MiniMap({ onGo }: { onGo: (id: PlaceId) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="minimap" aria-label="Map of the hall">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="88" className="map-wall" />
        <circle cx="100" cy="100" r="50" className="map-inner" />
        {PLACES.map((p) => {
          const m = mapPoint(p)
          return (
            <circle
              key={p.id}
              className={p.id === 'orb' ? 'map-dot core' : 'map-dot'}
              cx={m.x}
              cy={m.y}
              r={p.id === 'orb' ? 8 : 6}
              onClick={() => onGo(p.id)}
              onMouseEnter={() => setHover(p.label)}
              onMouseLeave={() => setHover(null)}
              role="button"
              aria-label={p.label}
            >
              <title>{p.label}</title>
            </circle>
          )
        })}
      </svg>
      <div className="map-label">{hover ?? 'Places · keys 1 to 5 · R overview'}</div>
    </div>
  )
}

const TABS: { id: TabId; icon: string; tip: string }[] = [
  { id: 'info', icon: 'ⓘ', tip: 'Project info (I)' },
  { id: 'crew', icon: '👥', tip: 'Crew (C)' },
  { id: 'activity', icon: '⏱', tip: 'Activity (A)' },
  { id: 'library', icon: '📚', tip: 'Library: markdown files (L)' },
]

/** The panels of the project live on the right edge: one click opens one beside it. */
export function TabStrip({ tab, onTab }: { tab: TabId | null; onTab: (t: TabId) => void }) {
  return (
    <div className="tabstrip" role="toolbar" aria-label="Panels">
      {TABS.map((t) => (
        <button key={t.id} className={`ibtn tip-left${tab === t.id ? ' on' : ''}`} data-tip={t.tip} aria-label={t.tip} onClick={() => onTab(t.id)}>
          {t.icon}
        </button>
      ))}
    </div>
  )
}

/** The way to turn, zoom and move, shown once for a few seconds and then gone (the full list is on the ? sheet). */
export function HintLine() {
  return <div className="hintline">Drag to turn · wheel to zoom · right-drag to move · ? for keys</div>
}

/** Every key, on one sheet. Opens with ? and closes with a click or Esc. */
export function KeysSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="keys-sheet" onClick={onClose} role="dialog" aria-label="Keyboard shortcuts">
      <div className="keys-card">
        <h3>Keyboard</h3>
        <div className="keys-cols">
          {[...KEYS_SHEET, { title: 'OTHER', rows: OTHER_KEYS }].map((g) => (
            <section key={g.title}>
              <h5>{g.title}</h5>
              {g.rows.map((r) => (
                <div key={r.label}>
                  <span>{r.label}</span>
                  <kbd>{r.key}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="info-sub">Click anywhere to close.</p>
      </div>
    </div>
  )
}
