import { describe, expect, it } from 'vitest'
import { exclusionGroup } from './transferExclusion'

// Minimal row shape the helper needs.
const row = (
  _row_index: number,
  is_transfer = false,
  transfer_pair_id: string | null = null,
) => ({ _row_index, is_transfer, transfer_pair_id })

describe('exclusionGroup', () => {
  it('returns both legs of a transfer pair when toggling either leg', () => {
    const rows = [
      row(0), // unrelated regular row
      row(1, true, 'pair-A'), // out leg
      row(2, true, 'pair-A'), // in leg
      row(3, true, 'pair-B'),
      row(4, true, 'pair-B'),
    ]
    // Toggling either leg must return the whole pair, never a single leg —
    // otherwise importBatch commits an orphaned half (P1).
    expect(exclusionGroup(rows, 1).sort()).toEqual([1, 2])
    expect(exclusionGroup(rows, 2).sort()).toEqual([1, 2])
    // A different pair is independent.
    expect(exclusionGroup(rows, 3).sort()).toEqual([3, 4])
  })

  it('returns only the row itself for a non-transfer row', () => {
    const rows = [row(0), row(1, true, 'pair-A'), row(2, true, 'pair-A')]
    expect(exclusionGroup(rows, 0)).toEqual([0])
  })

  it('returns only the row itself for a transfer row with no pair id', () => {
    // Defensive: is_transfer true but transfer_pair_id null shouldn't sweep in
    // every other null-pair row.
    const rows = [row(0, true, null), row(1, true, null)]
    expect(exclusionGroup(rows, 0)).toEqual([0])
  })

  it('returns the given index when no matching row exists', () => {
    expect(exclusionGroup([row(0)], 99)).toEqual([99])
  })
})
