import { useState, useEffect } from 'react'
import { assumptionsRepo, DEFAULT_ASSUMPTIONS } from '@db/repositories/assumptions.repo'
import { Field, Input, Btn } from '@components/FormField'
import { formatRp } from '@lib/currency'
import type { Assumptions } from '@db/types'

function pct(v: number) { return String(Math.round(v * 100)) }
function parsePct(s: string) { return Number(s.replace('%', '').trim()) / 100 }
function parseNum(s: string) { return Number(s.replace(/[.,\s]/g, '')) }

export function AssumptionsEditor() {
  const [data, setData] = useState<Assumptions | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // local field strings
  const [targetLow, setTargetLow] = useState('')
  const [targetHigh, setTargetHigh] = useState('')
  const [returnRdpu, setReturnRdpu] = useState('')
  const [returnEquity, setReturnEquity] = useState('')
  const [returnDplk, setReturnDplk] = useState('')
  const [returnGold, setReturnGold] = useState('')
  const [inflation, setInflation] = useState('')
  const [equitySwitch, setEquitySwitch] = useState('')

  useEffect(() => {
    assumptionsRepo.get().then((a) => {
      setData(a)
      setTargetLow(String(a.target_low))
      setTargetHigh(String(a.target_high))
      setReturnRdpu(pct(a.return_rdpu))
      setReturnEquity(pct(a.return_equity))
      setReturnDplk(pct(a.return_dplk))
      setReturnGold(pct(a.return_gold))
      setInflation(pct(a.inflation_rate))
      setEquitySwitch(String(a.equity_switch_month))
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    await assumptionsRepo.update({
      target_low: parseNum(targetLow),
      target_high: parseNum(targetHigh),
      return_rdpu: parsePct(returnRdpu),
      return_equity: parsePct(returnEquity),
      return_dplk: parsePct(returnDplk),
      return_gold: parsePct(returnGold),
      inflation_rate: parsePct(inflation),
      equity_switch_month: Number(equitySwitch),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleReset() {
    setSaving(true)
    await assumptionsRepo.update({ ...DEFAULT_ASSUMPTIONS })
    setSaving(false)
    assumptionsRepo.get().then((a) => {
      setTargetLow(String(a.target_low))
      setTargetHigh(String(a.target_high))
      setReturnRdpu(pct(a.return_rdpu))
      setReturnEquity(pct(a.return_equity))
      setReturnDplk(pct(a.return_dplk))
      setReturnGold(pct(a.return_gold))
      setInflation(pct(a.inflation_rate))
      setEquitySwitch(String(a.equity_switch_month))
    })
  }

  if (!data) return <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-section)' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionLabel>FI Target</SectionLabel>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Target Low (Rp)">
            <Input type="text" inputMode="numeric" mono
              value={targetLow} onChange={(e) => setTargetLow(e.target.value)}
              placeholder="4500000000"
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Target High (Rp)">
            <Input type="text" inputMode="numeric" mono
              value={targetHigh} onChange={(e) => setTargetHigh(e.target.value)}
              placeholder="6000000000"
            />
          </Field>
        </div>
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
        Low: {formatRp(parseNum(targetLow) || 0)} · High: {formatRp(parseNum(targetHigh) || 0)}
      </div>

      <SectionLabel>Annual Return Rates (real, after inflation)</SectionLabel>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="RDPU %">
          <Input type="text" inputMode="decimal" mono
            value={returnRdpu} onChange={(e) => setReturnRdpu(e.target.value)} placeholder="3" />
        </Field></div>
        <div style={{ flex: 1 }}><Field label="Equity %">
          <Input type="text" inputMode="decimal" mono
            value={returnEquity} onChange={(e) => setReturnEquity(e.target.value)} placeholder="7" />
        </Field></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="DPLK %">
          <Input type="text" inputMode="decimal" mono
            value={returnDplk} onChange={(e) => setReturnDplk(e.target.value)} placeholder="4" />
        </Field></div>
        <div style={{ flex: 1 }}><Field label="Gold %">
          <Input type="text" inputMode="decimal" mono
            value={returnGold} onChange={(e) => setReturnGold(e.target.value)} placeholder="1" />
        </Field></div>
      </div>

      <SectionLabel>Other</SectionLabel>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Inflation %">
          <Input type="text" inputMode="decimal" mono
            value={inflation} onChange={(e) => setInflation(e.target.value)} placeholder="3" />
        </Field></div>
        <div style={{ flex: 1 }}><Field label="Equity switch (months)">
          <Input type="text" inputMode="numeric" mono
            value={equitySwitch} onChange={(e) => setEquitySwitch(e.target.value)} placeholder="6" />
        </Field></div>
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', lineHeight: 1.5 }}>
        Path B: stay in RDPU for first N months then switch to equity.
      </div>

      <Btn onClick={handleSave} disabled={saving} fullWidth>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save assumptions'}
      </Btn>
      <Btn variant="secondary" onClick={handleReset} disabled={saving} fullWidth>
        Reset to defaults
      </Btn>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--text-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
      {children}
    </div>
  )
}
