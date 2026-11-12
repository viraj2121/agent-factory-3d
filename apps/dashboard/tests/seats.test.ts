import { describe, expect, it } from 'vitest'
import { seatsFor } from '../src/seats'

describe('seatsFor', () => {
  it('fills seats with robots first, then empty desks', () => {
    expect(seatsFor(2, 3)).toEqual(['robot', 'robot', 'empty'])
  })

  it('shows only empty desks when there are no agents', () => {
    expect(seatsFor(0, 3)).toEqual(['empty', 'empty', 'empty'])
  })

  it('ignores agents beyond the number of seats', () => {
    expect(seatsFor(5, 3)).toEqual(['robot', 'robot', 'robot'])
  })

  it('treats negative, fractional and non-numeric counts safely', () => {
    expect(seatsFor(-2, 3)).toEqual(['empty', 'empty', 'empty'])
    expect(seatsFor(1.9, 3)).toEqual(['robot', 'empty', 'empty'])
    expect(seatsFor(Number.NaN, 3)).toEqual(['empty', 'empty', 'empty'])
  })
})
