import type { Department } from './hallLayout'

/** One colour per department: the belts and the floor emblems share them. */
export const TASK_COLORS: Record<Department, string> = {
  planning: '#a78bfa',
  development: '#ffb347',
  review: '#22d3ee',
}
