import 'fake-indexeddb/auto'
import { db } from '@db/db'
import type { Allowance, ChatMemory, RecurringItem } from '@db/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildSystemPrompt } from './context'

const ACC_ID = 'acc-onb-1'

async function seed(opts: {
  recurring?: boolean
  memory?: boolean
  monthlyAmount?: number
  snoozedUntil?: string | null
} = {}) {
  await Promise.all([
    db.transactions.clear(),
    db.accounts.clear(),
    db.categories.clear(),
    db.allowance.clear(),
    db.recurringItems.clear(),
    db.assets.clear(),
    db.incomeEvents.clear(),
    db.assumptions.clear(),
    db.chatMemories.clear(),
  ])
  await db.accounts.add({
    id: ACC_ID,
    name: 'Test',
    institution: 'Bank',
    account_type: 'bank',
    lane: 'income_producing',
    currency: 'IDR',
    is_protected: false,
    is_active: true,
    manual_balance_override: null,
    last_balance_updated_at: null,
    created_at: '',
  })
  if (opts.recurring) {
    await db.recurringItems.add({
      id: 'rec-1',
      name: 'Netflix',
      amount: 150_000,
      cadence: 'monthly',
      kind: 'personal_sub',
      lane: 'protected_living',
      is_protected: false,
      is_active: true,
      next_due: '2099-01-01',
      end_date: null,
      note: null,
      created_at: '',
    })
  }
  if (opts.memory) {
    await db.chatMemories.add({
      id: 'mem-1',
      content: 'pay day 25',
      source_session_id: null,
      created_at: '',
      updated_at: '',
    })
  }
  await db.allowance.put({
    id: 'local',
    monthly_amount: opts.monthlyAmount ?? 0,
    weekend_allocation: 0,
    onboarding_snoozed_until: opts.snoozedUntil ?? null,
    updated_at: '',
  } as Allowance)
}

describe('buildSystemPrompt — ONBOARDING STATE (T1a)', () => {
  beforeEach(async () => {
    await seed()
  })

  it('emits ONBOARDING STATE when household is fully unconfigured', async () => {
    const prompt = await buildSystemPrompt()
    expect(prompt).toContain('=== ONBOARDING STATE ===')
    expect(prompt).toMatch(/unconfigured/i)
  })

  it('omits ONBOARDING STATE when recurring items, memory, and allowance all present', async () => {
    await seed({ recurring: true, memory: true, monthlyAmount: 2_000_000 })
    const prompt = await buildSystemPrompt()
    expect(prompt).not.toContain('=== ONBOARDING STATE ===')
  })

  it('omits ONBOARDING STATE when recurring items exist alone (FR-1.1 all three must be empty)', async () => {
    await seed({ recurring: true })
    const prompt = await buildSystemPrompt()
    expect(prompt).not.toContain('=== ONBOARDING STATE ===')
  })

  it('omits ONBOARDING STATE when snoozed to today (FR-1.2)', async () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const endOfDay = `${y}-${m}-${d}T23:59:59.999`
    await seed({ snoozedUntil: endOfDay })
    const prompt = await buildSystemPrompt()
    expect(prompt).not.toContain('=== ONBOARDING STATE ===')
  })

  it('emits ONBOARDING STATE when snoozed to yesterday (snooze expired)', async () => {
    const yest = new Date()
    yest.setDate(yest.getDate() - 1)
    const y = yest.getFullYear()
    const m = String(yest.getMonth() + 1).padStart(2, '0')
    const d = String(yest.getDate()).padStart(2, '0')
    const endOfDayYest = `${y}-${m}-${d}T23:59:59.999`
    await seed({ snoozedUntil: endOfDayYest })
    const prompt = await buildSystemPrompt()
    expect(prompt).toContain('=== ONBOARDING STATE ===')
  })

  it('emitted block is ≤ 400 characters (NFR-1.1)', async () => {
    const prompt = await buildSystemPrompt()
    const match = /=== ONBOARDING STATE ===([\s\S]*?)(?=\n===|$)/.exec(prompt)
    expect(match).toBeTruthy()
    const block = (match?.[0] ?? '')
    expect(block.length).toBeLessThanOrEqual(400)
  })

  it('mentions activeTab navigation (no router — C-5)', async () => {
    const prompt = await buildSystemPrompt()
    expect(prompt).toMatch(/activeTab|More tab/i)
    expect(prompt).not.toMatch(/\/onboarding|url.*router/i)
  })

  // TR-1.2: existing populated households must never see onboarding
  it('omits ONBOARDING STATE for populated household with transactions and income (TR-1.2)', async () => {
    await seed({ recurring: true, memory: true, monthlyAmount: 2_000_000 })
    await db.transactions.add({
      date: '2026-07-01', amount: 50_000, direction: 'out',
      account_id: ACC_ID, category_id: null, lane: 'protected_living',
      source: 'manual', title: 'Lunch', note: 'Warteg',
      original_amount: null, overridden_amount: null, override_note: null,
      overridden_at: null, is_transfer: false, transfer_pair_id: null,
      recurring_item_id: null, created_at: '',
    })
    await db.incomeEvents.add({
      id: 'inc-1', date: '2026-07-01', gross: 15_000_000,
      take_home_net: 12_000_000, delta_vs_prev: null,
      routed_to_pipe: 0, routed_to_lifestyle: 12_000_000,
      note: 'salary', source: 'manual', created_at: '',
    })
    const prompt = await buildSystemPrompt()
    expect(prompt).not.toContain('=== ONBOARDING STATE ===')
  })

  it('snooze works with date-only format (no UTC/local mismatch)', async () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const dateOnly = `${y}-${m}-${d}`
    await seed({ snoozedUntil: dateOnly })
    const prompt = await buildSystemPrompt()
    expect(prompt).not.toContain('=== ONBOARDING STATE ===')
  })

  it('snooze works with ISO Z-suffixed timestamp', async () => {
    const today = new Date()
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
    const isoZ = endOfDay.toISOString()
    await seed({ snoozedUntil: isoZ })
    const prompt = await buildSystemPrompt()
    expect(prompt).not.toContain('=== ONBOARDING STATE ===')
  })
})
