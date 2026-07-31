// D3 — every income event's delta_vs_prev is a fact about its neighbour, so a
// single edit can invalidate rows the user never touched. Editing a date moves
// the row through the series and changes the answer for its old neighbours and
// its new ones at once.
//
// Rather than work out which rows an edit invalidated — the fiddly, easy-to-get-
// wrong version — the whole series is recomputed. There are a handful of raises
// in a lifetime; the cost is nothing and the class of bug disappears.
import { describe, expect, it } from 'vitest'
import type { IncomeEvent } from '@db/types'
import { recomputeDeltas, salaryAfterRemoving } from './incomeSeries'

const ev = (over: Partial<IncomeEvent>): IncomeEvent => ({
  id: 'x',
  date: '2026-01-01',
  gross: 0,
  take_home_net: 10_000_000,
  delta_vs_prev: null,
  routed_to_pipe: 0,
  routed_to_lifestyle: 0,
  note: null,
  source: 'manual',
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('recomputeDeltas', () => {
  it('leaves the first event with no delta — there is nothing before it', () => {
    const [first] = recomputeDeltas([ev({ id: 'a' })])
    expect(first?.delta_vs_prev).toBeNull()
  })

  it('measures each event against the one before it in date order', () => {
    const out = recomputeDeltas([
      ev({ id: 'a', date: '2026-01-01', take_home_net: 10_000_000 }),
      ev({ id: 'b', date: '2026-06-01', take_home_net: 12_000_000 }),
      ev({ id: 'c', date: '2026-09-01', take_home_net: 11_500_000 }),
    ])
    expect(out.map((e) => e.delta_vs_prev)).toEqual([null, 2_000_000, -500_000])
  })

  it('sorts by date regardless of the order it was handed', () => {
    const out = recomputeDeltas([
      ev({ id: 'c', date: '2026-09-01', take_home_net: 11_500_000 }),
      ev({ id: 'a', date: '2026-01-01', take_home_net: 10_000_000 }),
      ev({ id: 'b', date: '2026-06-01', take_home_net: 12_000_000 }),
    ])
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  // Edge case 16 — without a stable tiebreak, "the current salary" flips
  // between two same-day rows at random, and the FI projection with it.
  it('breaks a same-date tie by created_at, not by chance', () => {
    const out = recomputeDeltas([
      ev({ id: 'late', date: '2026-06-01', created_at: '2026-06-01T18:00:00.000Z', take_home_net: 13_000_000 }),
      ev({ id: 'early', date: '2026-06-01', created_at: '2026-06-01T09:00:00.000Z', take_home_net: 12_000_000 }),
    ])
    expect(out.map((e) => e.id)).toEqual(['early', 'late'])
    expect(out[1]?.delta_vs_prev).toBe(1_000_000)
  })

  // The reason this function exists: an edited date re-sorts the series, and
  // the rows on either side of both the old and new position change answer.
  it('re-answers the neighbours when an edit moves a row through the series', () => {
    const before = recomputeDeltas([
      ev({ id: 'a', date: '2026-01-01', take_home_net: 10_000_000 }),
      ev({ id: 'b', date: '2026-06-01', take_home_net: 12_000_000 }),
      ev({ id: 'c', date: '2026-09-01', take_home_net: 15_000_000 }),
    ])
    expect(before.map((e) => e.delta_vs_prev)).toEqual([null, 2_000_000, 3_000_000])

    // 'c' is corrected to have happened before 'b'.
    const after = recomputeDeltas([
      ev({ id: 'a', date: '2026-01-01', take_home_net: 10_000_000 }),
      ev({ id: 'b', date: '2026-06-01', take_home_net: 12_000_000 }),
      ev({ id: 'c', date: '2026-03-01', take_home_net: 15_000_000 }),
    ])
    expect(after.map((e) => e.id)).toEqual(['a', 'c', 'b'])
    expect(after.map((e) => e.delta_vs_prev)).toEqual([null, 5_000_000, -3_000_000])
  })

  it('returns an empty series untouched', () => {
    expect(recomputeDeltas([])).toEqual([])
  })

  it('does not mutate the events it was given', () => {
    const original = ev({ id: 'a', delta_vs_prev: 999 })
    recomputeDeltas([original, ev({ id: 'b', date: '2026-06-01' })])
    expect(original.delta_vs_prev).toBe(999)
  })
})

// Deleting the newest raise silently changes what the FI projection and savings
// rate are built on. Say which figure takes over before it happens.
describe('salaryAfterRemoving', () => {
  const a = ev({ id: 'a', date: '2026-01-01', take_home_net: 10_000_000 })
  const b = ev({ id: 'b', date: '2026-06-01', take_home_net: 12_000_000 })

  it('names the event that becomes current when the newest goes', () => {
    expect(salaryAfterRemoving([a, b], 'b')?.id).toBe('a')
  })

  it('returns nothing when the last remaining event is deleted', () => {
    expect(salaryAfterRemoving([a], 'a')).toBeUndefined()
  })

  it('is unchanged when deleting an older event', () => {
    expect(salaryAfterRemoving([a, b], 'a')?.id).toBe('b')
  })
})
