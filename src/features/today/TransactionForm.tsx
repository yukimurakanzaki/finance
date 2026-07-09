import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { BottomSheet } from '@components/BottomSheet'
import { Field, Input, Btn } from '@components/FormField'
import { parseRpInput } from '@lib/currency'
import { WalletPicker } from './WalletPicker'
import type { Account, Transaction } from '@db/types'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'out' | 'in' | 'transfer'
  defaultDate: string
  editing?: Transaction
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--amber)' : 'var(--bg-2)',
  color: active ? 'var(--on-accent, #000)' : 'var(--ink-2)',
  border: `1px solid ${active ? 'var(--amber)' : 'var(--border-2)'}`,
  borderRadius: 14, padding: '5px 11px', fontSize: 12, cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
})

export function TransactionForm({ open, onClose, mode, defaultDate, editing }: Props) {
  const [date, setDate] = useState(editing?.date ?? defaultDate)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [categoryName, setCategoryName] = useState('')
  const [note, setNote] = useState(editing?.note ?? '')
  const [fromAccount, setFromAccount] = useState<Account | null>(null)
  const [toAccount, setToAccount] = useState<Account | null>(null)
  const [pickerFor, setPickerFor] = useState<'from' | 'to' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const recentTitles = useLiveQuery(async () => {
    const rows = await db.transactions.orderBy('date').reverse().toArray()
    const seen = new Set<string>()
    for (const r of rows) {
      if (r.title && r.source === 'manual') seen.add(r.title)
      if (seen.size >= 8) break
    }
    return [...seen]
  }) ?? []
  const pairLegs = useLiveQuery(
    async () => editing?.transfer_pair_id
      ? db.transactions.where('transfer_pair_id').equals(editing.transfer_pair_id).toArray()
      : [],
    [editing?.transfer_pair_id],
  ) ?? []

  // Prefill wallet + category when editing (once accounts/categories load)
  if (editing && !fromAccount && accounts.length > 0) {
    if (editing.is_transfer && editing.transfer_pair_id) {
      const outLeg = pairLegs.find((t) => t.direction === 'out')
      const inLeg = pairLegs.find((t) => t.direction === 'in')
      const fromAcc = accounts.find((a) => a.id === outLeg?.account_id)
      const toAcc = accounts.find((a) => a.id === inLeg?.account_id)
      if (fromAcc && toAcc) { setFromAccount(fromAcc); setToAccount(toAcc) }
    } else {
      const acc = accounts.find((a) => a.id === editing.account_id)
      if (acc) setFromAccount(acc)
      if (editing.category_id && !categoryName) {
        const cat = categories.find((c) => c.id === editing.category_id)
        if (cat) setCategoryName(cat.name)
      }
    }
  }

  async function resolveCategoryId(): Promise<string | null> {
    const name = categoryName.trim()
    if (!name) return null
    const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing.id ?? null
    const id = await db.categories.add({
      name, lane: 'protected_living', is_protected: false, envelope_id: null,
    })
    return id
  }

  async function handleSave() {
    setError(null)
    const amt = parseRpInput(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!fromAccount) { setError(mode === 'transfer' ? 'Pick the source wallet' : 'Pick a wallet'); return }
    if (mode === 'transfer' && !toAccount) { setError('Pick the destination wallet'); return }
    if (mode === 'transfer' && toAccount?.id === fromAccount.id) { setError('Wallets must differ'); return }
    setSaving(true)
    try {
      if (mode === 'transfer') {
        // Atomic: delete old pair + add new pair in one rw txn (repo calls nest/join)
        await db.transaction('rw', db.transactions, async () => {
          if (editing?.transfer_pair_id) await transactionsRepo.deleteWithPair(editing.id as string)
          await transactionsRepo.addTransfer({
            date, amount: amt,
            from_account_id: fromAccount.id as string, from_lane: fromAccount.lane,
            to_account_id: toAccount!.id as string, to_lane: toAccount!.lane,
            note: note || null,
          })
        })
      } else {
        const category_id = await resolveCategoryId()
        const record = {
          date, amount: amt, direction: mode, account_id: fromAccount.id as string,
          category_id, lane: fromAccount.lane, source: 'manual' as const,
          title: title.trim() || null, note: note || null,
          original_amount: null, overridden_amount: null, override_note: null,
          overridden_at: null, is_transfer: false, transfer_pair_id: null,
        }
        if (editing) await db.transactions.update(editing.id as string, record)
        else await transactionsRepo.add(record)
      }
      onClose()
    } catch {
      setError('Could not save — try again')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!editing) return
    await transactionsRepo.deleteWithPair(editing.id as string)
    onClose()
  }

  const titles = { out: 'Add expense', in: 'Add income', transfer: 'Transfer' }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? `Edit — ${titles[mode]}` : titles[mode]} height="85dvh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label={mode === 'transfer' ? 'From wallet *' : 'Wallet *'}>
          <button onClick={() => setPickerFor('from')} style={walletBtnStyle}>
            {fromAccount?.name ?? 'Select wallet…'}
          </button>
        </Field>

        {mode === 'transfer' && (
          <Field label="To wallet *">
            <button onClick={() => setPickerFor('to')} style={walletBtnStyle}>
              {toAccount?.name ?? 'Select wallet…'}
            </button>
          </Field>
        )}

        <Field label="Amount (Rp) *">
          <Input
            type="text" inputMode="numeric" mono autoFocus={!editing}
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="50.000" style={{ fontSize: 20, textAlign: 'center' }}
          />
        </Field>

        {mode !== 'transfer' && (
          <>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kopi pagi" />
            </Field>
            {recentTitles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {recentTitles.map((t) => (
                  <button key={t} onClick={() => setTitle(t)} style={chipStyle(title === t)}>{t}</button>
                ))}
              </div>
            )}

            <Field label="Category">
              <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Type to select or create…" />
            </Field>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryName(c.name)} style={chipStyle(categoryName.toLowerCase() === c.name.toLowerCase())}>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        <Field label="Description (optional)">
          <Input value={note ?? ''} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
        </Field>

        {error && <div style={{ fontSize: 12, color: 'var(--amber-text)' }}>{error}</div>}

        <Btn onClick={handleSave} disabled={saving} fullWidth>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        {editing && (
          <Btn variant="danger" onClick={handleDelete} fullWidth>Delete</Btn>
        )}
      </div>

      <WalletPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        accounts={accounts}
        excludeId={pickerFor === 'to' ? fromAccount?.id : pickerFor === 'from' ? toAccount?.id : undefined}
        onSelect={(a) => (pickerFor === 'to' ? setToAccount(a) : setFromAccount(a))}
      />
    </BottomSheet>
  )
}

const walletBtnStyle: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8,
  color: 'var(--ink-1)', padding: '10px 12px', fontSize: 14, width: '100%',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
