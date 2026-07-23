import { Btn, Field, Input } from '@components/FormField'
import { db } from '@db/db'
import { allowanceRepo } from '@db/repositories/allowance.repo'
import { formatRpFull } from '@lib/currency'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

export function AllowanceEditor() {
  const allowance = useLiveQuery(() => db.allowance.get('local'))
  const [monthly, setMonthly] = useState('')
  const [weekend, setWeekend] = useState('')
  const [saved, setSaved] = useState(false)

  function initForm() {
    if (allowance && !monthly) {
      setMonthly(String(allowance.monthly_amount))
      setWeekend(String(allowance.weekend_allocation))
    }
  }

  async function handleSave() {
    const m = Number(monthly.replace(/[.,]/g, ''))
    const w = Number(weekend.replace(/[.,]/g, ''))
    await allowanceRepo.set({ monthly_amount: m, weekend_allocation: w })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      style={{
        padding: 'var(--space-4) 0 var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {allowance && (
        <div
          style={{
            background: 'var(--bg-2)',
            borderRadius: 8,
            padding: 'var(--space-2) var(--space-3)',
            marginBottom: 4,
          }}
        >
          <div
            style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}
          >
            Current: {formatRpFull(allowance.monthly_amount)} / month ·{' '}
            {formatRpFull(allowance.weekend_allocation)} weekend
          </div>
        </div>
      )}

      <Field label="Monthly personal pool (Rp)">
        <Input
          type="text"
          inputMode="numeric"
          mono
          value={monthly || (allowance ? String(allowance.monthly_amount) : '')}
          onChange={(e) => setMonthly(e.target.value)}
          onFocus={initForm}
          placeholder="2.500.000"
        />
      </Field>
      <Field label="Weekend allocation (Rp, carved monthly)">
        <Input
          type="text"
          inputMode="numeric"
          mono
          value={
            weekend || (allowance ? String(allowance.weekend_allocation) : '')
          }
          onChange={(e) => setWeekend(e.target.value)}
          onFocus={initForm}
          placeholder="800.000"
        />
      </Field>
      <div
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--ink-3)',
          lineHeight: 1.5,
        }}
      >
        Weekend is pre-carved before workweek pool is calculated. The daily
        ceiling = (pool − subs − weekend) ÷ workweeks ÷ days left.
      </div>
      <Btn onClick={handleSave} disabled={!monthly} fullWidth>
        {saved ? '✓ Saved' : 'Save allowance'}
      </Btn>
    </div>
  )
}
