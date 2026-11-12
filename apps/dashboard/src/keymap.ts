import type { PlaceId } from './places'

// Every key the hub answers to, in one table: the key handler and the `?` sheet both read it, so they cannot disagree.
// R, G, H, [ and Esc are handled where they always were (the camera, the level, picture mode, the rail, the panels).

export type TabId = 'info' | 'crew' | 'activity' | 'library'
export type KeyAction = { type: 'place'; id: PlaceId } | { type: 'sound' } | { type: 'tour' } | { type: 'settings' } | { type: 'tab'; tab: TabId } | { type: 'keys' }

/** Keys by their lower-case form. */
export const ACTIONS: Record<string, KeyAction> = {
  '1': { type: 'place', id: 'orb' },
  '2': { type: 'place', id: 'studio' },
  '3': { type: 'place', id: 'launchpad' },
  '4': { type: 'place', id: 'library' },
  '5': { type: 'place', id: 'cart' },
  m: { type: 'sound' },
  t: { type: 'tour' },
  ',': { type: 'settings' },
  i: { type: 'tab', tab: 'info' },
  c: { type: 'tab', tab: 'crew' },
  a: { type: 'tab', tab: 'activity' },
  l: { type: 'tab', tab: 'library' },
  '?': { type: 'keys' },
}

export const actionFor = (key: string): KeyAction | null => ACTIONS[key.toLowerCase()] ?? null

export interface KeyGroup {
  title: string
  rows: { label: string; key: string }[]
}

export const KEYS_SHEET: KeyGroup[] = [
  {
    title: 'PLACES',
    rows: [
      { label: 'Core', key: '1' },
      { label: 'Design studio', key: '2' },
      { label: 'Launch pad', key: '3' },
      { label: 'Library', key: '4' },
      { label: 'Cart', key: '5' },
    ],
  },
  {
    title: 'VIEW',
    rows: [
      { label: 'Sound', key: 'M' },
      { label: 'Camera tour', key: 'T' },
      { label: 'Settings', key: ',' },
    ],
  },
  {
    title: 'PANELS',
    rows: [
      { label: 'Project info', key: 'I' },
      { label: 'Crew', key: 'C' },
      { label: 'Activity', key: 'A' },
      { label: 'Library (markdown files)', key: 'L' },
      { label: 'This sheet', key: '?' },
    ],
  },
]

/** Keys handled elsewhere, shown on the sheet as well. */
export const OTHER_KEYS: { label: string; key: string }[] = [
  { label: 'Reset the view', key: 'R' },
  { label: 'Hall or solar system', key: 'G' },
  { label: 'Picture mode', key: 'H' },
  { label: 'Fold the project rail', key: '[' },
  { label: 'Close a panel', key: 'Esc' },
]
