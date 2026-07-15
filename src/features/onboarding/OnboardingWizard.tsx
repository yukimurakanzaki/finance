import { useState, useEffect, useRef } from 'react'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { allowanceRepo } from '@db/repositories/allowance.repo'
import { recurringRepo } from '@db/repositories/recurringItems.repo'
import { incomeEventsRepo } from '@db/repositories/incomeEvents.repo'
import { accountsRepo } from '@db/repositories/accounts.repo'
import { Field, Input, Select, Btn } from '@components/FormField'
import { parseRpInput } from '@lib/currency'
import { todayISO } from '@lib/dates'
import type { Lane, AssetType, AccountType, RecurringKind } from '@db/types'

interface OnboardingWizardProps {
  onComplete: () => void
}

interface DraftState {
  step: number
  gross: string
  takeHome: string
  pipes: Array<{ name: string; amount: string }>
  dplk: string
  monthly: string
  weekend: string
  accountName: string
  accountInstitution: string
  accountType: AccountType
  startingBalance: string
}

const DEFAULT_DRAFT: DraftState = {
  step: 1,
  gross: '',
  takeHome: '',
  pipes: [{ name: 'RDPU Pipe', amount: '' }],
  dplk: '',
  monthly: '',
  weekend: '',
  accountName: 'BCA Tabungan',
  accountInstitution: 'BCA',
  accountType: 'bank',
  startingBalance: '',
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState(1)

  const [gross, setGross] = useState('')
  const [takeHome, setTakeHome] = useState('')
  const [pipes, setPipes] = useState([{ name: 'RDPU Pipe', amount: '' }])
  const [dplk, setDplk] = useState('')
  const [monthly, setMonthly] = useState('')
  const [weekend, setWeekend] = useState('')
  const [accountName, setAccountName] = useState('BCA Tabungan')
  const [accountInstitution, setAccountInstitution] = useState('BCA')
  const [accountType, setAccountType] = useState<AccountType>('bank')
  const [startingBalance, setStartingBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  // Restore draft on mount
  useEffect(() => {
    settingsRepo.get('onboarding_draft').then((raw) => {
      if (raw) {
        try {
          const draft = JSON.parse(raw) as DraftState
          setStep(draft.step ?? 1)
          setGross(draft.gross ?? '')
          setTakeHome(draft.takeHome ?? '')
          setPipes(draft.pipes?.length ? draft.pipes : DEFAULT_DRAFT.pipes)
          setDplk(draft.dplk ?? '')
          setMonthly(draft.monthly ?? '')
          setWeekend(draft.weekend ?? '')
          setAccountName(draft.accountName ?? DEFAULT_DRAFT.accountName)
          setAccountInstitution(draft.accountInstitution ?? DEFAULT_DRAFT.accountInstitution)
          setAccountType(draft.accountType ?? DEFAULT_DRAFT.accountType)
          setStartingBalance(draft.startingBalance ?? '')
        } catch {
          // corrupt draft — ignore, start fresh
        }
      }
      setLoaded(true)
    })
  }, [])

  // Persist draft whenever step or key fields change (after initial load)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (!loaded) return
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const draft: DraftState = {
      step, gross, takeHome, pipes, dplk, monthly, weekend,
      accountName, accountInstitution, accountType, startingBalance,
    }
    settingsRepo.set('onboarding_draft', JSON.stringify(draft))
  }, [step, gross, takeHome, pipes, dplk, monthly, weekend, accountName, accountInstitution, accountType, startingBalance, loaded])

  async function handleFinish() {
    // Validate every non-empty money field BEFORE writing anything — a silent
    // `?? 0` here corrupts the income/allowance figures that drive savings
    // rate, FI projection, and the safe-to-spend gauge (PAIN-POINTS T5).
    const invalid: string[] = []
    const money = (label: string, raw: string): number | null => {
      if (!raw.trim()) return null
      const n = parseRpInput(raw)
      if (n === null) invalid.push(label)
      return n
    }
    const grossN = money('Gross salary', gross)
    const takeHomeN = money('Take-home net', takeHome)
    const pipeNs = pipes.map((p, i) =>
      p.name && p.amount ? money(`Pipe ${i + 1}`, p.amount) : null,
    )
    const dplkN = money('DPLK', dplk)
    const monthlyN = money('Monthly pool', monthly)
    const weekendN = money('Weekend allocation', weekend)
    const openingBalance = money('Current balance', startingBalance)
    if (invalid.length > 0) {
      setFinishError(
        `Check these amounts — digits with optional thousand separators (e.g. 12.500.000): ${invalid.join(', ')}`,
      )
      return
    }
    setFinishError(null)
    setSaving(true)
    const today = todayISO()

    if (takeHomeN !== null) {
      await incomeEventsRepo.create({
        date: today,
        gross: grossN ?? 0,
        take_home_net: takeHomeN,
        delta_vs_prev: null,
        routed_to_pipe: pipeNs.reduce<number>((s, n) => s + (n ?? 0), 0),
        routed_to_lifestyle: monthlyN ?? 0,
        note: 'Onboarding',
        source: 'seed',
      })
    }

    for (const [i, pipe] of pipes.entries()) {
      if (pipe.name && pipe.amount) {
        await recurringRepo.create({
          name: pipe.name,
          amount: pipeNs[i] ?? 0,
          cadence: 'monthly',
          kind: 'pay_yourself_first' as RecurringKind,
          lane: 'income_producing' as Lane,
          is_protected: true,
          is_active: true,
          next_due: today,
          end_date: null,
          note: null,
        })
      }
    }

    if (dplkN !== null) {
      await recurringRepo.create({
        name: 'DPLK',
        amount: dplkN,
        cadence: 'monthly',
        kind: 'pay_yourself_first' as RecurringKind,
        lane: 'income_producing' as Lane,
        is_protected: true,
        is_active: true,
        next_due: today,
        end_date: null,
        note: null,
      })
    }

    if (monthlyN !== null) {
      await allowanceRepo.set({
        monthly_amount: monthlyN,
        weekend_allocation: weekendN ?? 0,
      })
    }

    if (accountName) {
      // Optional starting balance seeds the manual override. Anchor it to
      // YESTERDAY: deriveBalance ignores transactions dated on-or-before the
      // anchor day, and a brand-new account has no earlier transactions — so a
      // day-zero anchor of today would silently exclude the very first expense
      // the user logs after finishing setup. Left null when blank.
      const anchor = new Date(`${today}T12:00:00`)
      anchor.setDate(anchor.getDate() - 1)
      const anchorDay = anchor.toISOString().slice(0, 10)
      await accountsRepo.create({
        name: accountName,
        institution: accountInstitution,
        account_type: accountType,
        lane: 'protected_living' as Lane,
        currency: 'IDR',
        is_protected: false,
        is_active: true,
        manual_balance_override: openingBalance,
        last_balance_updated_at: openingBalance !== null ? anchorDay : null,
      })
    }

    await settingsRepo.set('setup_complete', 'true')
    // Clear draft now that setup is done
    await db.appSettings.delete('onboarding_draft')
    setSaving(false)
    onComplete()
  }

  // Don't render until we've tried to restore the draft
  if (!loaded) {
    return <div style={{ height: '100dvh', background: 'var(--bg-0)' }} />
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-0)', zIndex: 200,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 4, padding: '20px 20px 0', paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
        {[1, 2, 3, 4].map((s) => (
          <div key={s} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: s <= step ? 'var(--amber)' : 'var(--bg-3)',
            transition: 'background .3s',
          }} />
        ))}
      </div>

      <div style={{ flex: 1, padding: '28px 20px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {step === 1 && (
          <>
            <StepHeader
              step={1} total={4}
              title="Your take-home income"
              sub="The starting point of your financial model. Savings will flow from here first."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Gross salary (monthly)">
                <Input
                  type="text" inputMode="numeric"
                  placeholder="e.g. 15.000.000"
                  value={gross} onChange={(e) => setGross(e.target.value)}
                  mono
                />
              </Field>
              <Field label="Take-home net (monthly) *">
                <Input
                  type="text" inputMode="numeric"
                  placeholder="e.g. 12.500.000"
                  value={takeHome} onChange={(e) => setTakeHome(e.target.value)}
                  mono
                />
              </Field>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                Take-home is what actually lands in your bank account after tax and BPJS. This drives your savings rate.
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepHeader
              step={2} total={4}
              title="Pipe & DPLK"
              sub="Pay yourself first — these leave your account before you see the rest."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pipes.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <Field label={`Pipe ${i + 1} name`}>
                    <Input
                      value={p.name}
                      onChange={(e) => setPipes((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="e.g. RDPU Reksa Dana"
                    />
                  </Field>
                  <Field label="Monthly (Rp)">
                    <Input
                      type="text" inputMode="numeric" mono
                      value={p.amount}
                      onChange={(e) => setPipes((prev) => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      placeholder="500.000"
                    />
                  </Field>
                </div>
              ))}
              <button
                onClick={() => setPipes((p) => [...p, { name: '', amount: '' }])}
                style={{ background: 'none', border: '1px dashed var(--border-2)', borderRadius: 8, padding: '8px 0', color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
              >
                + Add pipe
              </button>
              <Field label="DPLK (monthly, optional)">
                <Input
                  type="text" inputMode="numeric" mono
                  value={dplk} onChange={(e) => setDplk(e.target.value)}
                  placeholder="e.g. 500.000"
                />
              </Field>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                Principle 6: savings is never the leftover. Pipe goes out first, then you live on what's left.
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <StepHeader
              step={3} total={4}
              title="Personal allowance"
              sub="What you have left for discretionary spending after pipes and bills."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Monthly personal pool (Rp) *">
                <Input
                  type="text" inputMode="numeric" mono
                  placeholder="e.g. 2.500.000"
                  value={monthly} onChange={(e) => setMonthly(e.target.value)}
                />
              </Field>
              <Field label="Weekend allocation (Rp, monthly)">
                <Input
                  type="text" inputMode="numeric" mono
                  placeholder="e.g. 800.000"
                  value={weekend} onChange={(e) => setWeekend(e.target.value)}
                />
              </Field>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                Weekend spend is carved out first, so your workweek ceiling is honest. The safe-to-spend gauge divides what's left by remaining workdays.
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <StepHeader
              step={4} total={4}
              title="First account"
              sub="Add your main spending account to start tracking transactions."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Account name *">
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. BCA Tabungan" />
              </Field>
              <Field label="Institution">
                <Input value={accountInstitution} onChange={(e) => setAccountInstitution(e.target.value)} placeholder="e.g. BCA" />
              </Field>
              <Field label="Type">
                <Select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
                  <option value="bank">Bank account</option>
                  <option value="digital_wallet">Digital wallet (GoPay, OVO…)</option>
                  <option value="cash">Cash</option>
                </Select>
              </Field>
              <Field label="Current balance (Rp)">
                <Input
                  type="text" inputMode="numeric" mono
                  placeholder="e.g. 3.500.000"
                  value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)}
                />
              </Field>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                Optional. What's in this account right now, so balances start correct. You can adjust it later.
              </div>
            </div>
          </>
        )}

        {finishError && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--amber-text)', lineHeight: 1.5, marginTop: 'auto' }}>
            {finishError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: finishError ? 0 : 'auto' }}>
          {step > 1 && (
            <Btn variant="secondary" style={{ flex: 1 }} onClick={() => setStep((s) => s - 1)}>
              Back
            </Btn>
          )}
          {step < 4 ? (
            <Btn style={{ flex: 2 }} onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !takeHome || step === 3 && !monthly}>
              Continue
            </Btn>
          ) : (
            <Btn style={{ flex: 2 }} onClick={handleFinish} disabled={saving}>
              {saving ? 'Saving…' : 'Finish setup'}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

function StepHeader({ step, total, title, sub }: { step: number; total: number; title: string; sub: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 8 }}>
        Step {step} of {total}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.3px', lineHeight: 1.2 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>
        {sub}
      </div>
    </div>
  )
}
