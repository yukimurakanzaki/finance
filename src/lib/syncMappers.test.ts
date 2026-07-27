import { describe, expect, it } from 'vitest'
import { fromCloudRow, isSyncable, maxUpdatedAt, scrubNumericStrings, toCloudRow } from './syncMappers'

const UUID = '11111111-1111-1111-1111-111111111111'

describe('isSyncable', () => {
  it('accepts uuid ids on regular tables, rejects non-uuids', () => {
    expect(isSyncable('accounts', { id: UUID })).toBe(true)
    expect(isSyncable('accounts', { id: 'local' })).toBe(false)
    expect(isSyncable('accounts', { id: '5' })).toBe(false)
    expect(isSyncable('accounts', {})).toBe(false)
  })
  it('always accepts singleton tables regardless of id', () => {
    expect(isSyncable('allowance', { id: 'local' })).toBe(true)
    expect(isSyncable('assumptions', { id: 'local' })).toBe(true)
  })
})

describe('maxUpdatedAt', () => {
  it('returns the latest timestamp, never below the current watermark', () => {
    const rows = [{ updated_at: '2026-01-02T00:00:00Z' }, { updated_at: '2026-03-01T00:00:00Z' }]
    expect(maxUpdatedAt(rows, '2026-01-01T00:00:00Z')).toBe('2026-03-01T00:00:00Z')
    expect(maxUpdatedAt([], '2026-05-05T00:00:00Z')).toBe('2026-05-05T00:00:00Z')
  })
})

describe('toCloudRow', () => {
  it('adds household_id and keeps id for regular tables', () => {
    const out = toCloudRow('accounts', { id: UUID, name: 'BCA' }, 'hh1', 'user1')
    expect(out).toEqual({ id: UUID, name: 'BCA', household_id: 'hh1' })
  })
  it('maps allowance to (household_id, member_id) and drops local id', () => {
    const out = toCloudRow('allowance', { id: 'local', monthly_amount: 2500000 }, 'hh1', 'user1')
    expect(out).toEqual({ household_id: 'hh1', member_id: 'user1', monthly_amount: 2500000 })
    expect(out).not.toHaveProperty('id')
  })
  it('maps assumptions to household_id and drops local id', () => {
    const out = toCloudRow('assumptions', { id: 'local', target_low: 1 }, 'hh1', 'user1')
    expect(out).toEqual({ household_id: 'hh1', target_low: 1 })
  })
})

describe('fromCloudRow', () => {
  it('strips household_id and keeps id for regular tables', () => {
    const out = fromCloudRow('accounts', { id: UUID, name: 'BCA', household_id: 'hh1' })
    expect(out).toEqual({ id: UUID, name: 'BCA' })
  })
  it('collapses singletons to the fixed local id', () => {
    const out = fromCloudRow('allowance', {
      household_id: 'hh1',
      member_id: 'user1',
      monthly_amount: 2500000,
    })
    expect(out).toEqual({ id: 'local', monthly_amount: 2500000 })
  })
  // Postgres returns bigint as a string over the wire. Without coercion, the
  // string lands in Dexie, and the next push 400s on the bigint column.
  it('coerces numeric fields from string to number (bigint wire format)', () => {
    const out = fromCloudRow('transactions', {
      id: UUID,
      household_id: 'hh1',
      amount: '295.32',
      original_amount: null,
      overridden_amount: '100',
    })
    expect(out.amount).toBe(295.32)
    expect(typeof out.amount).toBe('number')
    expect(out.overridden_amount).toBe(100)
    expect(out.original_amount).toBeNull()
  })
  it('leaves non-numeric, non-listed fields untouched', () => {
    const out = fromCloudRow('accounts', {
      id: UUID,
      household_id: 'hh1',
      name: 'BCA',
      lane: 'protected_living',
    })
    expect(out).toEqual({ id: UUID, name: 'BCA', lane: 'protected_living' })
  })
})

describe('scrubNumericStrings', () => {
  it('coerces a string numeric field in place and reports the change', () => {
    const row: Record<string, unknown> = { id: UUID, amount: '295.32' }
    const changed = scrubNumericStrings('transactions', row)
    expect(changed).toBe(true)
    expect(row.amount).toBe(295.32)
  })
  it('returns false when the row is already numeric', () => {
    const row: Record<string, unknown> = { id: UUID, amount: 295.32 }
    const changed = scrubNumericStrings('transactions', row)
    expect(changed).toBe(false)
    expect(row.amount).toBe(295.32)
  })
  it('leaves an empty string alone (it is not a number)', () => {
    const row: Record<string, unknown> = { id: UUID, amount: '' }
    const changed = scrubNumericStrings('transactions', row)
    expect(changed).toBe(false)
    expect(row.amount).toBe('')
  })
})

// Round-trip: local -> cloud -> local preserves a regular row's identity/data.
describe('round-trip', () => {
  it('regular row survives to-cloud then from-cloud', () => {
    const local = { id: UUID, name: 'BCA', lane: 'protected_living' }
    const cloud = toCloudRow('accounts', local, 'hh1', 'user1')
    const back = fromCloudRow('accounts', cloud)
    expect(back).toEqual(local)
  })
})
