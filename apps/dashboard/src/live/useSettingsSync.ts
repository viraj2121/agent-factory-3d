import { useCallback, useEffect, useRef, useState } from 'react'
import { toDisplay, uiStore } from '../uiSettings'
import type { LiveState } from './liveProjects'
import { fetchSettings, putSettings, type SettingsPatch, type SettingsView } from './settingsApi'

/**
 * Keeps the settings file of the agent service and this page in step. When the service is reached, the display
 * choices saved in its file win (so every browser shows the same); if the file has none yet, this page's choices are
 * written there. After that, every change of a display choice is sent (a moment later, once per burst of changes).
 */
export function useSettingsSync(state: LiveState, base: string) {
  const [view, setView] = useState<SettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const synced = useRef(false)

  useEffect(() => {
    if (state !== 'live') {
      synced.current = false
      return
    }
    let cancelled = false
    void fetchSettings(base).then(async (v) => {
      if (cancelled || !v) return
      if (Object.keys(v.settings.display).length > 0) uiStore.replace(v.settings.display)
      else {
        const r = await putSettings(base, { display: toDisplay(uiStore.get()) })
        if (r.ok) v = r.view
      }
      if (cancelled) return
      setView(v)
      synced.current = true
    })
    return () => {
      cancelled = true
    }
  }, [state, base])

  useEffect(() => {
    let timer = 0
    const stop = uiStore.subscribe(() => {
      if (!synced.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void putSettings(base, { display: toDisplay(uiStore.get()) }).then((r) => {
          if (r.ok) setView(r.view)
          else setError(r.error)
        })
      }, 400)
    })
    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [base])

  /** Sends one change of the service settings (days, folders, hidden projects, names). */
  const change = useCallback(
    async (patch: SettingsPatch): Promise<boolean> => {
      const r = await putSettings(base, patch)
      if (r.ok) {
        setView(r.view)
        setError(null)
        return true
      }
      setError(r.error)
      return false
    },
    [base],
  )

  // without the service there are no service settings to show
  return { view: state === 'live' ? view : null, error, change }
}
