import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input, Select } from '@components/FormField'
import { db } from '@db/db'
import { accountsRepo } from '@db/repositories/accounts.repo'
import type { Account, AccountType, Lane } from '@db/types'
import { parseRpBalance } from '@lib/currency'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  editing?: Account | undefined
}

const LANE_OPTIONS: { value: Lane; label: string }[] = [
  { value: 'income_producing', label: 'Income Producing' },
  { value: 'store_of_value', label: 'Store of Value' },
  { value: 'debt_liability', label: 'Debt / Liability' },
  { value: 'protected_living', label: 'Protected Living' },
  { value: 'pass_through', label: 'Pass-through (held for others)' },
]

export function AccountForm({ open, onClose, editing }: Props) {
  const [name, setName] = useState(editing?.name ?? '')
  const [institution, setInstitution] = useState(editing?.institution ?? '')
  const [accountType, setAccountType] = useState<AccountType>(
    editing?.account_type ?? 'bank',
  )
  const [lane, setLane] = useState<Lane>(editing?.lane ?? 'protected_living')
  const [manualBalance, setManualBalance] = useState(
    editing?.manual_balance_override
      ? String(editing.manual_balance_override)
      : '',
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blocked, setBlocked] = useState<{ count: number } | null>(null)
  const [moveTo, setMoveTo] = useState('')

  const otherAccounts = (
    useLiveQuery(() => db.accounts.filter((a) => a.is_active).toArray()) ?? []
  ).filter((a) => a.id !== editing?.id)

  // The sheet stays mounted between opens, so an armed delete or a stale
  // "blocked" notice would survive into the next account the user taps.
  useEffect(() => {
    if (!open) {
      setConfirmDelete(false)
      setBlocked(null)
      setMoveTo('')
    }
  }, [open])

  const needsManualBalance = accountType !== 'bank'

  // Delete is refused while history points here, and the refusal carries the
  // way out rather than just a "no": move the transactions, or deactivate.
  // Deleting them is never on the menu — that would silently rewrite past
  // months' spending and net worth.
  async function handleDelete() {
    if (!editing?.id) return
    if (!confirmDelete && !blocked) {
      setConfirmDelete(true)
      return
    }
    const result = await accountsRepo.deleteAccount(editing.id)
    if (result.ok) {
      onClose()
      return
    }
    setConfirmDelete(false)
    setBlocked({ count: result.count })
  }

  async function handleSave() {
    if (!name) return
    setSaving(true)
    const data = {
      name,
      institution,
      account_type: accountType,
      lane,
      currency: 'IDR',
      is_protected: false,
      is_active: true,
      // parseRpBalance, not a bare separator strip: this is the onboarding
      // opening balance, and "12.5" silently became 125 (PAIN-POINTS T5). Zero
      // is a legal opening balance, which is why it isn't parseRpInput.
      manual_balance_override:
        needsManualBalance && manualBalance
          ? parseRpBalance(manualBalance)
          : null,
      last_balance_updated_at:
        needsManualBalance && manualBalance
          ? new Date().toISOString().slice(0, 10)
          : null,
    }
    if (editing?.id) {
      await accountsRepo.update(editing.id, data)
    } else {
      await accountsRepo.create(data)
    }
    setSaving(false)
    onClose()
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit account' : 'Add account'}
      height="85dvh"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Account name *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BCA Tabungan"
          />
        </Field>
        <Field label="Institution">
          <Input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="e.g. BCA, blu, GoPay"
          />
        </Field>
        <Field label="Type">
          <Select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
          >
            <option value="bank">Bank account</option>
            <option value="digital_wallet">Digital wallet (GoPay, OVO…)</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>
        <Field label="Lane (Kiyosaki)">
          <Select
            value={lane}
            onChange={(e) => setLane(e.target.value as Lane)}
          >
            {LANE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {needsManualBalance && (
          <Field label="Current balance (Rp)">
            <Input
              type="text"
              inputMode="numeric"
              mono
              value={manualBalance}
              onChange={(e) => setManualBalance(e.target.value)}
              placeholder="e.g. 250.000"
            />
          </Field>
        )}
        {!needsManualBalance && (
          <div
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--ink-3)',
              lineHeight: 1.5,
            }}
          >
            Bank account balance is derived from imported transactions — no
            manual entry needed.
          </div>
        )}
        <Btn onClick={handleSave} disabled={saving || !name} fullWidth>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
        </Btn>
        {editing?.id && (
          <>
            {/* D2 — deactivate and delete are different promises and must not
                look alike: one hides an account and keeps every transaction,
                the other removes it for good. */}
            <Btn
              variant="secondary"
              onClick={async () => {
                await accountsRepo.deactivate(editing.id as string)
                onClose()
              }}
              fullWidth
            >
              Deactivate — hides it, keeps every transaction
            </Btn>

            <div style={{ height: 'var(--space-3)' }} />

            <Btn
              variant="danger"
              onClick={handleDelete}
              disabled={blocked !== null}
              fullWidth
            >
              {confirmDelete
                ? `Delete "${editing.name}" — tap again to confirm`
                : 'Delete permanently'}
            </Btn>

            {blocked && (
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  lineHeight: 'var(--leading-caption)',
                  color: 'var(--ink-2)',
                }}
              >
                {blocked.count} transactions still point at this account. They
                stay in your history — move them somewhere first, or deactivate
                instead.
                <Field label="Move them to">
                  <Select
                    value={moveTo}
                    onChange={(e) => setMoveTo(e.target.value)}
                  >
                    <option value="">Select an account…</option>
                    {otherAccounts.map((a) => (
                      <option key={a.id} value={a.id as string}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Btn
                  variant="secondary"
                  disabled={!moveTo}
                  fullWidth
                  onClick={async () => {
                    await accountsRepo.moveTransactions(
                      editing.id as string,
                      moveTo,
                    )
                    setBlocked(null)
                  }}
                >
                  Move them
                </Btn>
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
