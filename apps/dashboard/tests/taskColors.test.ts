import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '../src/hallLayout'
import { TASK_COLORS } from '../src/taskColors'

describe('TASK_COLORS', () => {
  it('has a different colour for every department', () => {
    expect(new Set(DEPARTMENTS.map((d) => TASK_COLORS[d])).size).toBe(DEPARTMENTS.length)
    for (const d of DEPARTMENTS) expect(TASK_COLORS[d]).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
