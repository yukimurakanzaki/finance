import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { allowanceRepo } from '@db/repositories/allowance.repo'
import { Field, Input, Btn } from '@components/FormField'
import { formatRpFull } from '@lib/currency'

export function AllowanceEditor() {
  const allowance = useLiveQuery(() => db.allowance.get(1))
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
    <div style={{ padding: '16px 0 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {allowance && (
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Current: {formatRpFull(allowance.monthly_amount)} / month · {formatRpFull(allowance.weekend_allocation)} weekend</div>
        </div>
      )}

      <Field label="Monthly personal pool (Rp)">
        <Input
          type="text" inputMode="numeric" mono
          value={monthly || (allowance ? String(allowance.monthly_amount) : '')}
          onChange={(e) => setMonthly(e.target.value)}
          onFocus={initForm}
          placeholder="2.500.000"
        />
      </Field>
      <Field label="Weekend allocation (Rp, carved monthly)">
        <Input
          type="text" inputMode="numeric" mono
          value={weekend || (allowance ? String(allowance.weekend_allocation) : '')}
          onChange={(e) => setWeekend(e.target.value)}
          onFocus={initForm}
          placeholder="800.000"
        />
      </Field>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        Weekend is pre-carved before workweek pool is calculated. The daily ceiling = (pool − subs − weekend) ÷ workweeks ÷ days left.
      </div>
      <Btn onClick={handleSave} disabled={!monthly} fullWidth>
        {saved ? '✓ Saved' : 'Save allowance'}
      </Btn>
    </div>
  )
}
