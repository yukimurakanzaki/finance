import { useState } from 'react'
import { accountsRepo } from '@db/repositories/accounts.repo'
import { BottomSheet } from '@components/BottomSheet'
import { Field, Input, Select, Btn } from '@components/FormField'
import type { Account, AccountType, Lane } from '@db/types'

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
  const [accountType, setAccountType] = useState<AccountType>(editing?.account_type ?? 'bank')
  const [lane, setLane] = useState<Lane>(editing?.lane ?? 'protected_living')
  const [manualBalance, setManualBalance] = useState(editing?.manual_balance_override ? String(editing.manual_balance_override) : '')
  const [saving, setSaving] = useState(false)

  const needsManualBalance = accountType !== 'bank'

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
      manual_balance_override: needsManualBalance && manualBalance ? Number(manualBalance.replace(/[.,]/g, '')) : null,
      last_balance_updated_at: needsManualBalance && manualBalance ? new Date().toISOString().slice(0, 10) : null,
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
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit account' : 'Add account'} height="85dvh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Account name *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BCA Tabungan" />
        </Field>
        <Field label="Institution">
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. BCA, blu, GoPay" />
        </Field>
        <Field label="Type">
          <Select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
            <option value="bank">Bank account</option>
            <option value="digital_wallet">Digital wallet (GoPay, OVO…)</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>
        <Field label="Lane (Kiyosaki)">
          <Select value={lane} onChange={(e) => setLane(e.target.value as Lane)}>
            {LANE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        {needsManualBalance && (
          <Field label="Current balance (Rp)">
            <Input
              type="text" inputMode="numeric" mono
              value={manualBalance}
              onChange={(e) => setManualBalance(e.target.value)}
              placeholder="e.g. 250.000"
            />
          </Field>
        )}
        {!needsManualBalance && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            Bank account balance is derived from imported transactions — no manual entry needed.
          </div>
        )}
        <Btn onClick={handleSave} disabled={saving || !name} fullWidth>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
        </Btn>
        {editing && (
          <Btn variant="danger" onClick={async () => { if (editing.id) await accountsRepo.deactivate(editing.id); onClose() }} fullWidth>
            Deactivate account
          </Btn>
        )}
      </div>
    </BottomSheet>
  )
}
