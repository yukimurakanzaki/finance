import 'fake-indexeddb/auto'
import { db } from '@db/db'
import { isoWeekStart } from '@lib/dates'
import { beforeEach, describe, expect, it } from 'vitest'
import { executeReadTool } from './tools'

// A date inside the current ISO week, so the seeded spend actually draws down
// this week's pool rather than falling outside the window.
const thisWeek = () => isoWeekStart(new Date())

async function seed(monthlyAmount: number, spentThisWeek: number) {
  await db.transactions.clear()
  await db.allowance.clear()
  await db.recurringItems.clear()

  await db.allowance.put({
    id: 'local',
    monthly_amount: monthlyAmount,
    weekend_allocation: 0,
  } as never)

  if (spentThisWeek > 0) {
    await db.transactions.add({
      date: thisWeek(),
      amount: spentThisWeek,
      direction: 'out',
      account_id: 'acc-1',
      lane: 'protected_living',
      title: 'Belanja',
      note: null,
      category_id: null,
      source: 'manual',
      is_transfer: false,
    } as never)
  }
}

const call = async (amount: unknown) =>
  JSON.parse(await executeReadTool('check_affordability', { amount } as never))

beforeEach(async () => {
  await seed(4_000_000, 0)
})

describe('check_affordability tool', () => {
  it('returns a verdict with the driving number attached', async () => {
    const r = await call(50_000)
    expect(r.verdict).toBe('comfortable')
    // FR-D1c.3 — a verdict never travels without its number.
    expect(typeof r.remaining_pool_this_week).toBe('number')
    expect(r.formatted.remaining_pool_this_week).toContain('Rp')
  })

  it('reports over when the amount exceeds the remaining pool', async () => {
    const r = await call(99_000_000)
    expect(r.verdict).toBe('over')
    expect(r.remaining_after_purchase).toBeLessThan(0)
  })

  it('reflects spending already logged this week', async () => {
    const before = await call(400_000)
    await seed(4_000_000, 900_000)
    const after = await call(400_000)
    // Same purchase, smaller pool — the verdict must move with the ledger,
    // which is the whole reason the tool recomputes instead of being cached.
    expect(after.remaining_pool_this_week).toBeLessThan(
      before.remaining_pool_this_week,
    )
  })

  it('is unknown, with a reason, when no allowance is set', async () => {
    await seed(0, 0)
    const r = await call(50_000)
    expect(r.verdict).toBe('unknown')
    expect(r.reason).toMatch(/allowance/i)
    // An empty-state household must never be told it is "over" (NFR-11.3).
    expect(r.remaining_pool_this_week).toBeUndefined()
  })

  it('is unknown for a non-integer amount', async () => {
    const r = await call(1234.56)
    expect(r.verdict).toBe('unknown')
  })

  it('is unknown for a missing amount', async () => {
    const r = await call(undefined)
    expect(r.verdict).toBe('unknown')
  })
})
