// D3 — the income series and its deltas.
//
// `delta_vs_prev` is not a property of an event, it is a property of a *pair*.
// That makes every write a potential lie about rows nobody touched: edit a
// date and the row slides through the series, changing the answer for its old
// neighbours and its new ones simultaneously. Creating and deleting do the same
// thing at the ends.
//
// So nothing here tries to work out which rows an edit invalidated. The whole
// series is recomputed on every write. A working life holds a handful of
// raises, so the cost is nothing, and an entire class of "which neighbour did I
// forget" bug never exists.
import type { IncomeEvent } from '@db/types'

/**
 * Every event in date order, each carrying its delta against the one before it.
 * Pure: returns new objects and leaves the inputs alone.
 */
export function recomputeDeltas(events: IncomeEvent[]): IncomeEvent[] {
  const ordered = [...events].sort(compareEvents)
  return ordered.map((event, i) => {
    const prev = ordered[i - 1]
    return {
      ...event,
      delta_vs_prev: prev ? event.take_home_net - prev.take_home_net : null,
    }
  })
}

/** The newest event, by the same ordering the deltas use. */
export function latestOf(events: IncomeEvent[]): IncomeEvent | undefined {
  return [...events].sort(compareEvents).at(-1)
}

/**
 * Which event becomes "the current salary" once `id` is removed — undefined if
 * nothing is left.
 *
 * Deleting the newest raise silently re-bases the FI projection and the savings
 * rate, both of which read the latest event. The user should be told which
 * figure takes over before it happens, not after they notice the projection
 * moved.
 */
export function salaryAfterRemoving(
  events: IncomeEvent[],
  id: string,
): IncomeEvent | undefined {
  return latestOf(events.filter((e) => e.id !== id))
}

// Date first, then created_at. The tiebreak is not cosmetic: two raises logged
// with the same effective date would otherwise order by insertion chance, and
// "the current salary" — which the FI projection and savings rate both read —
// would flip between them at random.
function compareEvents(a: IncomeEvent, b: IncomeEvent): number {
  return a.date === b.date
    ? a.created_at.localeCompare(b.created_at)
    : a.date.localeCompare(b.date)
}
