import { useSyncExternalStore } from 'react'
import { sound } from './soundEngine'
import { focusName } from './soundFocus'

/** Turns the hall's sound on and off, with a volume slider while it is on. It starts off, because browsers only allow sound after a click. */
export default function SoundButton() {
  const on = useSyncExternalStore(sound.subscribe, () => sound.on)
  const volume = useSyncExternalStore(sound.subscribe, () => sound.volume)
  const focus = useSyncExternalStore(sound.subscribe, () => sound.focus)
  return (
    <>
      <button className={`ibtn${on ? ' on' : ''}`} onClick={() => sound.toggle()} aria-label={`Sound ${on ? 'on' : 'off'}`} data-tip={on ? `Sound on (M) · hearing ${focusName(focus)}` : 'Sound off (M)'}>
        {on ? '🔊' : '🔇'}
      </button>
      {on && (
        <input
          className="volume"
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => sound.setVolume(Number(e.target.value) / 100)}
          aria-label="Volume"
          title="Volume"
        />
      )}
    </>
  )
}
