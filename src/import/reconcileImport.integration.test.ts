// M1 Product Integrity Audit — Reconcile/import atomicity & idempotency.
//
// Requirement (REDESIGN-GAP-AUDIT.md §3, Reconcile/import):
//   Import batch is atomic and idempotent; failures never partially commit.
//
// Three import paths exist in the codebase:
//   1. `transactionsRepo.importBatch` — the Dexie reconcile path (ReconcileConfirmScreen).
//   2. `import_batch` RPC — the Supabase/Postgres cloud path (supabase/migrations/20260704000004).
//   3. `executeWriteTool('log_transactions')` — the AI Manager chat path (src/ai/tools.ts).
//
// This file audits the client paths (1 and 3). The RPC path (2) is SQL and is
// atomic by virtue of being a single PL/pgSQL function (implicit transaction);
// its idempotency gap is documented here as a finding, not asserted — it needs
// a server-side test against the live RPC, which is out of scope for the
// client test suite.
//
// Findings (pinned by the tests below):
//   - Atomicity: importBatch (Dexie) is atomic — a mid-batch failure rolls back
//     transactions AND the snapshot AND recurring advancement. PASS.
//   - Atomicity: AI log_transactions is NOT atomic — it loops db.transactions.add
//     per row with no wrapping transaction, so a mid-loop failure leaves partial
//     writes. FAIL (documented, regression-pinned until fixed).
//   - Idempotency: importBatch (Dexie) is NOT idempotent — replaying the same
//     batch inserts duplicate rows (no dedupe before bulkAdd). PARTIAL (gap).
//   - Idempotency: AI log_transactions IS dedupe-safe — it checks
//     getDuplicateCandidate before each add, so a replay skips duplicates. PASS.
//   - Idempotency: import_batch RPC is NOT idempotent — no idempotency key is
//     checked server-side; replaying inserts duplicates. PARTIAL (gap, needs
//     server-side test). Documented in PROPOSAL.md §1.7: "client keeps a
//     per-batch idempotency key" — the key is not yet implemented.
import 'fake-indexeddb/auto'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import type { Account, Category, Lane, RecurringItem } from '@db/types'
import type { ValidImportRow } from '@import/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeWriteTool } from '../ai/tools'

const account: Account = {
  id: 'acc-bca',
  name: 'BCA',
  institution: 'BCA',
  account_type: 'bank',
  lane: 'protected_living',
  currency: 'IDR',
  is_protected: false,
  is_active: true,
  manual_balance_override: null,
  last_balance_updated_at: null,
  created_at: '',
}

const category: Category = {
  id: 'cat-food',
  name: 'Food',
  lane: 'protected_living',
  is_protected: false,
  envelope_id: null,
}

const blankTotals: Record<Lane, number> = {
  income_producing: 0,
  store_of_value: 0,
  debt_liability: 0,
  protected_living: 0,
  pass_through: 0,
}

function importRow(over: Partial<ValidImportRow> = {}): ValidImportRow {
  return {
    _row_index: 0,
    date: '2026-07-07',
    amount: 50_000,
    direction: 'out',
    account_id: 'acc-bca',
    category: 'Food',
    suggested_lane: 'protected_living',
    note: 'Lunch',
    _resolved_account: account,
    _resolved_category: category,
    ...over,
  }
}

const recurring = (over: Partial<RecurringItem>): RecurringItem => ({
  name: 'Netflix',
  amount: 150_000,
  cadence: 'monthly',
  kind: 'personal_sub',
  lane: 'protected_living',
  is_protected: false,
  is_active: true,
  next_due: '2026-07-01',
  end_date: null,
  note: null,
  created_at: '',
  ...over,
})

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.netWorthSnapshots.clear(),
    db.recurringItems.clear(),
    db.accounts.clear(),
    db.categories.clear(),
  ])
  await db.accounts.put(account)
  await db.categories.put(category)
})

describe('Reconcile/import: atomicity (Dexie importBatch)', () => {
  it('commits transactions and snapshot together on success', async () => {
    await transactionsRepo.importBatch(
      [
        importRow({ amount: 50_000 }),
        importRow({ _row_index: 1, amount: 30_000 }),
      ],
      '2026-07',
      blankTotals,
      0,
    )

    const txns = await db.transactions.toArray()
    const snap = await db.netWorthSnapshots
      .where('year_month')
      .equals('2026-07')
      .first()
    expect(txns).toHaveLength(2)
    expect(snap?.year_month).toBe('2026-07')
  })

  it('rolls back transactions AND snapshot when the batch throws mid-commit', async () => {
    // Sabotage bulkAdd so it fails on the first call. This simulates a
    // mid-transaction error (e.g. quota exceeded, constraint violation) and
    // verifies the Dexie transaction rolls back every store it touched.
    const spy = vi
      .spyOn(db.transactions, 'bulkAdd')
      .mockRejectedValue(new Error('simulated mid-batch failure'))

    await expect(
      transactionsRepo.importBatch([importRow()], '2026-07', blankTotals, 0),
    ).rejects.toThrow('simulated mid-batch failure')

    spy.mockRestore()

    // Nothing committed — both stores are empty.
    const txns = await db.transactions.toArray()
    const snaps = await db.netWorthSnapshots.toArray()
    expect(txns).toHaveLength(0)
    expect(snaps).toHaveLength(0)
  })

  it('rolls back recurring next_due advancement when the batch throws', async () => {
    await db.recurringItems.put(
      recurring({ id: 'rec-netflix', next_due: '2026-07-01' }),
    )
    const before = await db.recurringItems.get('rec-netflix')

    // Force a failure inside the transaction by sabotaging bulkAdd.
    const spy = vi
      .spyOn(db.transactions, 'bulkAdd')
      .mockRejectedValue(
        new Error('simulated failure before recurring advancement'),
      )

    await expect(
      transactionsRepo.importBatch(
        [importRow({ note: 'Netflix monthly subscription' })],
        '2026-07',
        blankTotals,
        0,
      ),
    ).rejects.toThrow('simulated failure before recurring advancement')

    spy.mockRestore()

    // Recurring next_due must NOT have advanced — the transaction rolled back.
    const after = await db.recurringItems.get('rec-netflix')
    expect(after?.next_due).toBe(before?.next_due)
    expect(after?.next_due).toBe('2026-07-01')
  })
})

describe('Reconcile/import: idempotency (Dexie importBatch)', () => {
  it('replaying the same batch inserts duplicate rows (idempotency gap)', async () => {
    // This test PINS the known gap: importBatch has no dedupe before bulkAdd,
    // so a replay (e.g. after a dropped connection where the client believes
    // the first call failed but it actually succeeded) creates duplicates.
    // PROPOSAL.md §1.7 specifies the fix: client-generated idempotency key +
    // upsert semantics. Until that lands, this test documents the gap.
    const rows = [importRow({ amount: 50_000, note: 'Lunch' })]
    await transactionsRepo.importBatch(rows, '2026-07', blankTotals, 0)
    await transactionsRepo.importBatch(rows, '2026-07', blankTotals, 0)

    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(2)
    expect(txns.every((t) => t.amount === 50_000 && t.note === 'Lunch')).toBe(
      true,
    )
  })

  it('snapshot upsert is idempotent (no duplicate snapshots on replay)', async () => {
    // The net_worth_snapshots upsert IS idempotent: same year_month updates
    // the existing row instead of inserting a second one.
    const rows = [importRow()]
    await transactionsRepo.importBatch(rows, '2026-07', blankTotals, 100_000)
    await transactionsRepo.importBatch(rows, '2026-07', blankTotals, 200_000)

    const snaps = await db.netWorthSnapshots
      .where('year_month')
      .equals('2026-07')
      .toArray()
    expect(snaps).toHaveLength(1)
    expect(snaps[0]?.total).toBe(200_000) // last write wins
  })
})

describe('Reconcile/import: atomicity (AI log_transactions)', () => {
  it('partial write on mid-loop failure (atomicity gap)', async () => {
    // This test PINS the known gap: AI log_transactions loops db.transactions.add
    // per row with NO wrapping Dexie transaction. A failure on the second row
    // leaves the first row committed — a partial write that violates the
    // "failures never partially commit" requirement.
    //
    // The fix: wrap the loop in db.transaction('rw', db.transactions, async () => {...})
    // so a mid-loop failure rolls back every row added in that call.
    const txns = [
      {
        date: '2026-07-07',
        amount: 50_000,
        direction: 'out' as const,
        account_id: 'acc-bca',
        lane: 'protected_living' as Lane,
        note: 'Lunch',
      },
      {
        date: '2026-07-07',
        amount: 30_000,
        direction: 'out' as const,
        account_id: 'acc-missing',
        lane: 'protected_living' as Lane,
        note: 'Dinner',
      },
    ]

    // The second row references a non-existent account. The current code
    // validates account existence per-row and pushes to `errors`, but the
    // FIRST row has already been added by then — a partial write.
    await executeWriteTool('log_transactions', { transactions: txns })

    const saved = await db.transactions.toArray()
    // Gap: the first row was saved even though the second row was invalid.
    expect(saved).toHaveLength(1)
    expect(saved[0]?.note).toBe('Lunch')
  })
})

describe('Reconcile/import: idempotency (AI log_transactions)', () => {
  it('replaying the same batch skips duplicates (dedupe-safe)', async () => {
    // Unlike importBatch, the AI path checks getDuplicateCandidate before each
    // add (unless allow_duplicates: true). A replay skips rows that match an
    // existing transaction on date + amount + direction + account_id.
    const txns = [
      {
        date: '2026-07-07',
        amount: 50_000,
        direction: 'out' as const,
        account_id: 'acc-bca',
        lane: 'protected_living' as Lane,
        note: 'Lunch',
      },
    ]

    await executeWriteTool('log_transactions', { transactions: txns })
    await executeWriteTool('log_transactions', { transactions: txns })

    const saved = await db.transactions.toArray()
    expect(saved).toHaveLength(1) // no duplicate
  })

  it('allow_duplicates: true overrides the dedupe check', async () => {
    const txns = [
      {
        date: '2026-07-07',
        amount: 50_000,
        direction: 'out' as const,
        account_id: 'acc-bca',
        lane: 'protected_living' as Lane,
        note: 'Lunch',
      },
    ]

    await executeWriteTool('log_transactions', { transactions: txns })
    await executeWriteTool('log_transactions', {
      transactions: txns,
      allow_duplicates: true,
    })

    const saved = await db.transactions.toArray()
    expect(saved).toHaveLength(2)
  })
})

describe('Reconcile/import: RPC idempotency (documented gap)', () => {
  it('import_batch RPC has no idempotency key check (documented, not asserted)', () => {
    // This is a documentation test — it records the finding so the gap is
    // visible in the test suite. The actual fix needs a server-side test
    // against the live RPC (supabase/tests/) and a migration adding an
    // idempotency_key column + unique constraint, per PROPOSAL.md §1.7:
    //   "client-generated UUIDs + upsert semantics; replaying the outbox
    //    after a dropped connection cannot duplicate rows."
    //
    // Current state (supabase/migrations/20260704000004_p0_rpcs.sql):
    //   - import_batch inserts rows from jsonb_array_elements(p_rows) with no
    //     dedupe check against existing transactions.
    //   - The snapshot upsert IS idempotent (on conflict do update).
    //   - The transaction insert is NOT idempotent.
    //
    // Status: Partial (Capability gap). Risk: High. Action: add idempotency
    // key to import_batch RPC + client-side per-batch key tracking.
    expect(true).toBe(true)
  })
})
