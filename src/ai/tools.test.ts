import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { executeWriteTool } from './tools'

const row = (over: Record<string, unknown> = {}) => ({
  date: '2026-07-09', amount: 24_000, direction: 'out', account_id: 'acc-1',
  lane: 'protected_living', title: 'Kopi pagi', note: 'Kopi Kenangan', ...over,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
  await db.accounts.add({
    id: 'acc-1', name: 'Gopay', institution: 'GoTo', account_type: 'digital_wallet',
    lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
    manual_balance_override: null, last_balance_updated_at: null, created_at: '',
  })
})

describe('log_transactions', () => {
  it('saves title', async () => {
    const res = JSON.parse(await executeWriteTool('log_transactions', { transactions: [row()] }))
    expect(res.saved_count).toBe(1)
    const t = await db.transactions.toCollection().first()
    expect(t?.title).toBe('Kopi pagi')
  })

  it('skips exact duplicates and reports them', async () => {
    await executeWriteTool('log_transactions', { transactions: [row()] })
    const res = JSON.parse(await executeWriteTool('log_transactions', { transactions: [row()] }))
    expect(res.saved_count).toBe(0)
    expect(res.possible_duplicates).toHaveLength(1)
  })

  it('saves duplicates when allow_duplicates is true', async () => {
    await executeWriteTool('log_transactions', { transactions: [row()] })
    const res = JSON.parse(await executeWriteTool('log_transactions', {
      transactions: [row()], allow_duplicates: true,
    }))
    expect(res.saved_count).toBe(1)
  })
})
