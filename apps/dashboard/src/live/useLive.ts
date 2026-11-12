import { useEffect, useState } from 'react'
import { parseSnapshot, serviceUrl, type LiveState } from './liveProjects'
import type { Snapshot } from './wire'

const PARAMS = new URLSearchParams(window.location.search)
const OFF = PARAMS.get('live') === 'off'
const BASE = serviceUrl(PARAMS.get('service'))
const GIVE_UP_MS = 4000

/**
 * Follows the agent service on this computer. 'live' once a good snapshot arrived, 'offline' when the service does not
 * answer (the page then shows the labelled demo projects), 'off' when the address has ?live=off. The browser reconnects
 * by itself, so starting the service later switches the hub to live data without a reload.
 */
export function useLive(): { state: LiveState; snapshot: Snapshot | null; base: string } {
  const [state, setState] = useState<LiveState>(OFF ? 'off' : 'connecting')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    if (OFF) return
    const source = new EventSource(`${BASE}/api/events`)
    const giveUp = window.setTimeout(() => setState((s) => (s === 'connecting' ? 'offline' : s)), GIVE_UP_MS)
    source.addEventListener('snapshot', (e) => {
      try {
        const parsed = parseSnapshot(JSON.parse((e as MessageEvent<string>).data))
        if (!parsed) return setState('offline')
        setSnapshot(parsed)
        setState('live')
      } catch {
        setState('offline')
      }
    })
    source.onerror = () => {
      setState('offline')
      setSnapshot(null)
    }
    return () => {
      window.clearTimeout(giveUp)
      source.close()
    }
  }, [])

  return { state, snapshot, base: BASE }
}
