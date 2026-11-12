export type SeatState = 'robot' | 'empty'

/** One entry per seat: robots fill the seats first, the rest stay empty desks. */
export function seatsFor(agentCount: number, seatCount: number): SeatState[] {
  const robots = Number.isFinite(agentCount) ? Math.max(0, Math.min(Math.floor(agentCount), seatCount)) : 0
  return Array.from({ length: seatCount }, (_, i) => (i < robots ? 'robot' : 'empty'))
}
