import { useState, useEffect, useRef } from 'react'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { allowanceRepo } from '@db/repositories/allowance.repo'
import { recurringRepo } from '@db/repositories/recurringItems.repo'
import { incomeEventsRepo } from '@db/repositories/incomeEvents.repo'
import { accountsRepo } from '@db/repositories/accounts.repo'
import { Field, Input, Select, Btn } from '@components/FormField'
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
  const [saving, setSaving] = useState(false)

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
      accountName, accountInstitution, accountType,
    }
    settingsRepo.set('onboarding_draft', JSON.stringify(draft))
  }, [step, gross, takeHome, pipes, dplk, monthly, weekend, accountName, accountInstitution, accountType, loaded])

  async function handleFinish() {
    setSaving(true)
    const today = todayISO()

    if (takeHome) {
      await incomeEventsRepo.create({
        date: today,
        gross: Number(gross.replace(/[.,]/g, '')) || 0,
        take_home_net: Number(takeHome.replace(/[.,]/g, '')),
        delta_vs_prev: null,
        routed_to_pipe: pipes.reduce((s, p) => s + (Number(p.amount.replace(/[.,]/g, '')) || 0), 0),
        routed_to_lifestyle: Number(monthly.replace(/[.,]/g, '')) || 0,
        note: 'Onboarding',
        source: 'seed',
      })
    }

    for (const pipe of pipes) {
      if (pipe.name && pipe.amount) {
        await recurringRepo.create({
          name: pipe.name,
          amount: Number(pipe.amount.replace(/[.,]/g, '')),
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

    if (dplk) {
      await recurringRepo.create({
        name: 'DPLK',
        amount: Number(dplk.replace(/[.,]/g, '')),
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

    if (monthly) {
      await allowanceRepo.set({
        monthly_amount: Number(monthly.replace(/[.,]/g, '')),
        weekend_allocation: Number(weekend.replace(/[.,]/g, '')) || 0,
      })
    }

    if (accountName) {
      await accountsRepo.create({
        name: accountName,
        institution: accountInstitution,
        account_type: accountType,
        lane: 'protected_living' as Lane,
        currency: 'IDR',
        is_protected: false,
        is_active: true,
        manual_balance_override: null,
        last_balance_updated_at: null,
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
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
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
