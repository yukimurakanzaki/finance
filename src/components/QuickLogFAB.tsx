import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { BottomSheet } from './BottomSheet'
import { Field, Input, Select, Btn } from './FormField'
import { todayISO } from '@lib/dates'
import type { Lane } from '@db/types'

const LANE_OPTIONS: { value: Lane; label: string }[] = [
  { value: 'income_producing', label: 'Income Producing' },
  { value: 'store_of_value', label: 'Store of Value' },
  { value: 'debt_liability', label: 'Debt / Liability' },
  { value: 'protected_living', label: 'Protected Living' },
  { value: 'pass_through', label: 'Pass-through (not your money)' },
]

export function QuickLogFAB() {
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState('')
  const [lane, setLane] = useState<Lane>('protected_living')
  const [saving, setSaving] = useState(false)

  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).toArray()) ?? []

  function reset() {
    setAmount(''); setNote(''); setDirection('out'); setLane('protected_living')
  }

  async function handleLog() {
    if (!amount || !accountId) return
    setSaving(true)
    const acc = accounts.find((a) => a.id === accountId)
    if (!acc?.id) { setSaving(false); return }
    await transactionsRepo.add({
      date: todayISO(),
      amount: Number(amount.replace(/[.,]/g, '')),
      direction,
      account_id: acc.id,
      category_id: null,
      lane,
      source: 'manual',
      note: note || null,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: false,
      transfer_pair_id: null,
    })
    setSaving(false)
    reset()
    setOpen(false)
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', right: 18, bottom: 'calc(68px + env(safe-area-inset-bottom))',
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--amber)', border: 'none',
          fontSize: 24, color: '#000', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(240,165,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
        }}
      >
        +
      </button>

      <BottomSheet open={open} onClose={() => { setOpen(false); reset() }} title="Quick log" height="75dvh">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* In / Out toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['out', 'in'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: direction === d ? (d === 'out' ? 'var(--bg-4)' : 'var(--engine-bg)') : 'var(--bg-2)',
                  color: direction === d ? (d === 'out' ? 'var(--ink-1)' : 'var(--engine)') : 'var(--ink-3)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                  outline: direction === d ? `1px solid ${d === 'out' ? 'var(--border-2)' : 'var(--engine)'}` : 'none',
                }}
              >
                {d === 'out' ? '− Spend' : '+ Income'}
              </button>
            ))}
          </div>

          <Field label="Amount (Rp) *">
            <Input
              type="text" inputMode="numeric" mono autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="50.000"
              style={{ fontSize: 22, padding: '12px', textAlign: 'center' }}
            />
          </Field>

          <Field label="Account *">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Lane">
            <Select value={lane} onChange={(e) => setLane(e.target.value as Lane)}>
              {LANE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>

          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Makan siang Warteg" />
          </Field>

          <Btn onClick={handleLog} disabled={saving || !amount || !accountId} fullWidth>
            {saving ? 'Saving…' : 'Log transaction'}
          </Btn>
        </div>
      </BottomSheet>
    </>
  )
}
