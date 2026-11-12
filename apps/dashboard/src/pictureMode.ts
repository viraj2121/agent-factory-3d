import { useSyncExternalStore } from 'react'

// Picture mode: every bar, panel, label and counter fades out, leaving only the 3D picture. Not saved: it is a
// moment to look or take a screenshot. H toggles it, Esc leaves it.

let on = false
const listeners = new Set<() => void>()

export const pictureMode = {
  get: () => on,
  set(value: boolean) {
    if (value === on) return
    on = value
    document.body.dataset.picture = on ? 'on' : 'off'
    listeners.forEach((fn) => fn())
  },
  toggle() {
    this.set(!on)
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

export function usePictureMode(): boolean {
  return useSyncExternalStore(pictureMode.subscribe, pictureMode.get)
}
