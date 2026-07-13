// Verifies the legacy-id re-key migration against a real (fake-indexeddb) Dexie
// instance: numeric ids become UUIDs, FKs are rewritten, updated_at is stamped
// (so rows become pushable), UUID rows are untouched, and a second run is a no-op.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, syncControl } from '@db/db'
import { migrateLegacyIds } from './legacyIdMigration'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const legacyAccount = (id: number) => ({
  id: id as unknown as string,
  name: `Acc${id}`, institution: 'BCA', account_type: 'bank' as const, lane: 'protected_living' as const,
  currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '2026-01-01T00:00:00Z',
})

describe('migrateLegacyIds', () => {
  beforeEach(async () => {
    for (const t of ['accounts', 'categories', 'envelopes', 'transactions', 'incomeEvents', 'milestones']) {
      await db.table(t).clear()
    }
  })

  it('re-keys numeric-id rows to UUIDs, rewrites FKs, stamps updated_at', async () => {
    // Seed with hooks suppressed so rows keep legacy numeric ids and no updated_at,
    // exactly like a backup restored into the v7 schema.
    syncControl.applyingRemote = true
    try {
      await db.accounts.add(legacyAccount(1))
      await db.categories.add({
        id: 7 as unknown as string, name: 'Groceries', lane: 'protected_living',
        is_protected: false, envelope_id: null,
      })
      await db.transactions.add({
        id: 42 as unknown as string, date: '2026-06-01', amount: 50_000, direction: 'out',
        account_id: '1', category_id: '7', lane: 'protected_living', source: 'manual',
        title: null, note: null, original_amount: null, overridden_amount: null, override_note: null,
        overridden_at: null, is_transfer: false, transfer_pair_id: null, recurring_item_id: null,
        created_at: '2026-06-01T00:00:00Z',
      })
    } finally {
      syncControl.applyingRemote = false
    }

    const migrated = await migrateLegacyIds()
    expect(migrated).toBe(3)

    const [account] = await db.accounts.toArray()
    const [category] = await db.categories.toArray()
    const [txn] = await db.transactions.toArray()

    expect(account!.id).toMatch(UUID_RE)
    expect(category!.id).toMatch(UUID_RE)
    expect(txn!.id).toMatch(UUID_RE)
    // FKs now point at the new UUIDs
    expect(txn!.account_id).toBe(account!.id)
    expect(txn!.category_id).toBe(category!.id)
    // updated_at stamped -> rows are now pushable by the watermark sync
    for (const row of [account!, txn!] as Array<{ updated_at?: string }>) {
      expect(row.updated_at).toBeTruthy()
    }
    // data intact
    expect(txn!.amount).toBe(50_000)
    expect(account!.name).toBe('Acc1')
  })

  it('leaves UUID rows untouched and is a no-op when nothing is legacy', async () => {
    await db.accounts.add({ ...legacyAccount(0), id: crypto.randomUUID() })
    const before = await db.accounts.toArray()
    expect(await migrateLegacyIds()).toBe(0)
    expect(await db.accounts.toArray()).toEqual(before)
  })

  it('second run is a no-op (idempotent)', async () => {
    syncControl.applyingRemote = true
    try {
      await db.accounts.add(legacyAccount(3))
    } finally {
      syncControl.applyingRemote = false
    }
    expect(await migrateLegacyIds()).toBe(1)
    expect(await migrateLegacyIds()).toBe(0)
  })
})
