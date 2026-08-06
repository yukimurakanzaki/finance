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
  // assets.value drives net worth, chat counters are int8 columns — all three
  // were missing from the allowlist and hit the same push 400.
  it('coerces the asset value and the chat token counters', () => {
    expect(fromCloudRow('assets', { id: UUID, value: '4200000' }).value).toBe(
      4_200_000,
    )
    const session = fromCloudRow('chatSessions', {
      id: UUID,
      message_count: '12',
      total_input_tokens: '3400',
      total_output_tokens: '900',
    })
    expect(session).toMatchObject({
      message_count: 12,
      total_input_tokens: 3400,
      total_output_tokens: 900,
    })
    expect(
      fromCloudRow('chatMessages', { id: UUID, input_tokens: '55' })
        .input_tokens,
    ).toBe(55)
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

// D1 — balance corrections sync like any other household-scoped table. The
// numeric fields are bigints in Postgres and come back as strings over the
// wire, which is the exact class of bug that made pushes 400 before
// coerceNumeric existed in fromCloudRow.
describe('balanceCorrections sync mapping', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'

  it('coerces bigint balances back to numbers on pull', () => {
    const out = fromCloudRow('balanceCorrections', {
      id: UUID,
      household_id: 'hh1',
      previous_balance: '690000',
      new_balance: '412000',
    })
    expect(out.previous_balance).toBe(690_000)
    expect(out.new_balance).toBe(412_000)
  })

  it('drops household_id on the way in and stamps it on the way out', () => {
    const local = { id: UUID, account_id: 'acc1', new_balance: 412_000 }
    const cloud = toCloudRow('balanceCorrections', local, 'hh1', 'user1')
    expect(cloud.household_id).toBe('hh1')
    expect(fromCloudRow('balanceCorrections', cloud).household_id).toBeUndefined()
  })

  // SEC-2 — attribution is stamped by the cloud's `default auth.uid()`. Pushing
  // the column at all (even as null) would defeat that default and let a client
  // choose who a correction is attributed to.
  it('never pushes created_by', () => {
    const cloud = toCloudRow(
      'balanceCorrections',
      { id: UUID, account_id: 'acc1' },
      'hh1',
      'user1',
    )
    expect('created_by' in cloud).toBe(false)
  })

  it('scrubs a balance that already landed locally as a string', () => {
    const row: Record<string, unknown> = { previous_balance: '690000' }
    expect(scrubNumericStrings('balanceCorrections', row)).toBe(true)
    expect(row.previous_balance).toBe(690_000)
  })
})
