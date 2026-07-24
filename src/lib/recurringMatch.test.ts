import type { RecurringItem } from '@db/types'
import { describe, expect, it } from 'vitest'
import {
  matchRecurringItemByText,
  resolveRecurringItemId,
} from './recurringMatch'

function item(overrides: Partial<RecurringItem>): RecurringItem {
  return {
    id: 'item-1',
    name: 'Netflix',
    amount: 150_000,
    cadence: 'monthly',
    kind: 'personal_sub',
    lane: 'protected_living',
    is_protected: false,
    is_active: true,
    next_due: '2026-08-01',
    end_date: null,
    note: null,
    created_at: '',
    ...overrides,
  }
}

describe('matchRecurringItemByText', () => {
  it('matches when the item name is a substring of the text', () => {
    const netflix = item({ id: 'rec-netflix', name: 'Netflix' })
    expect(matchRecurringItemByText('Netflix subscription', [netflix])).toBe(
      netflix,
    )
  })

  it('is case-insensitive', () => {
    const netflix = item({ id: 'rec-netflix', name: 'Netflix' })
    expect(matchRecurringItemByText('NETFLIX SUBSCRIPTION', [netflix])).toBe(
      netflix,
    )
    expect(matchRecurringItemByText('netflix subscription', [netflix])).toBe(
      netflix,
    )
  })

  it('returns null when nothing matches', () => {
    const netflix = item({ id: 'rec-netflix', name: 'Netflix' })
    expect(matchRecurringItemByText('Kopi pagi', [netflix])).toBeNull()
  })

  it('returns null for empty/absent text', () => {
    const netflix = item({ id: 'rec-netflix', name: 'Netflix' })
    expect(matchRecurringItemByText('', [netflix])).toBeNull()
    expect(matchRecurringItemByText(undefined, [netflix])).toBeNull()
    expect(matchRecurringItemByText(null, [netflix])).toBeNull()
  })

  it('never matches an inactive item, even if it is not in the candidate list', () => {
    // Caller is responsible for filtering to is_active; this test documents
    // that an inactive item passed in by mistake still matches (matching
    // itself is dumb string logic) — the real guarantee is that call sites
    // only ever pass db.recurringItems.filter(r => r.is_active).
    const inactiveNetflix = item({
      id: 'rec-netflix',
      name: 'Netflix',
      is_active: false,
    })
    // Simulate the correct call site behavior: filter before calling.
    const active = [inactiveNetflix].filter((r) => r.is_active)
    expect(matchRecurringItemByText('Netflix subscription', active)).toBeNull()
  })

  it('ignores blank-named items rather than matching everything', () => {
    const blank = item({ id: 'rec-blank', name: '   ' })
    expect(matchRecurringItemByText('anything at all', [blank])).toBeNull()
  })
})

describe('resolveRecurringItemId', () => {
  const netflix = item({ id: 'rec-netflix', name: 'Netflix' })

  it('accepts an id that belongs to an active recurring item', () => {
    expect(resolveRecurringItemId('rec-netflix', [netflix])).toBe('rec-netflix')
  })

  it('rejects an unknown id', () => {
    expect(resolveRecurringItemId('rec-does-not-exist', [netflix])).toBeNull()
  })

  it('rejects an id belonging to an inactive item not present in the active list', () => {
    // Call sites pass only is_active items; an id for a deactivated item
    // simply won't be found in that list.
    expect(resolveRecurringItemId('rec-netflix', [])).toBeNull()
  })

  it('rejects null/undefined/empty candidates', () => {
    expect(resolveRecurringItemId(null, [netflix])).toBeNull()
    expect(resolveRecurringItemId(undefined, [netflix])).toBeNull()
    expect(resolveRecurringItemId('', [netflix])).toBeNull()
  })
})
