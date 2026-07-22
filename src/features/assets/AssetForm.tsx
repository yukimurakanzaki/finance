import { useState } from 'react'
import { assetsRepo } from '@db/repositories/assets.repo'
import { BottomSheet } from '@components/BottomSheet'
import { Field, Input, Select, Btn } from '@components/FormField'
import { todayISO } from '@lib/dates'
import { FX_CODES, fetchMarketPrices, goldPerGramIDR, idrPerUnit } from '@lib/marketPrices'
import type { Asset, AssetType, Lane } from '@db/types'

interface Props {
  open: boolean
  onClose: () => void
  editing?: Asset | undefined
}

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'investment_rdpu', label: 'Reksa Dana Pasar Uang (RDPU)' },
  { value: 'investment_equity', label: 'Equity / Saham' },
  { value: 'gold', label: 'Gold (emas)' },
  { value: 'currency', label: 'Foreign currency (USD, SGD…)' },
  { value: 'dplk', label: 'DPLK / Pensiun' },
  { value: 'storyforge', label: 'Storyforge / Business equity' },
  { value: 'other', label: 'Other' },
]

const TYPE_LANE: Record<AssetType, Lane> = {
  investment_rdpu: 'income_producing',
  investment_equity: 'income_producing',
  gold: 'store_of_value',
  currency: 'store_of_value',
  dplk: 'income_producing',
  storyforge: 'income_producing',
  other: 'store_of_value',
}

export function AssetForm({ open, onClose, editing }: Props) {
  const [name, setName] = useState(editing?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(editing?.asset_type ?? 'investment_rdpu')
  const [value, setValue] = useState(editing ? String(editing.value) : '')
  const [grams, setGrams] = useState(editing?.quantity_grams ? String(editing.quantity_grams) : '')
  const [pricePerGram, setPricePerGram] = useState(editing?.price_per_gram ? String(editing.price_per_gram) : '')
  const [autoGold, setAutoGold] = useState(editing ? editing.auto_price === 'gold_spot' : true)
  const [fxCode, setFxCode] = useState(editing?.fx_code ?? 'USD')
  const [fxAmount, setFxAmount] = useState(editing?.fx_amount ? String(editing.fx_amount) : '')
  const [saving, setSaving] = useState(false)
  const [fetchNote, setFetchNote] = useState<string | null>(null)

  const isGold = assetType === 'gold'
  const isCurrency = assetType === 'currency'
  const computedGoldValue = isGold && !autoGold && grams && pricePerGram
    ? Number(grams.replace(/[.,]/g, '')) * Number(pricePerGram.replace(/[.,]/g, ''))
    : null

  async function handleSave() {
    if (!name) return
    setSaving(true)
    setFetchNote(null)
    const today = todayISO()

    let computedValue = computedGoldValue ?? (Number(value.replace(/[.,]/g, '')) || 0)
    let perGram = pricePerGram ? Number(pricePerGram.replace(/[.,]/g, '')) : null
    const gramsNum = grams ? Number(grams.replace(/[.,]/g, '')) : null
    const fxAmountNum = fxAmount ? Number(fxAmount.replace(/,/g, '.')) : null

    // Auto-priced assets: fetch live price now so the value is right immediately
    if ((isGold && autoGold && gramsNum) || (isCurrency && fxAmountNum)) {
      try {
        const prices = await fetchMarketPrices()
        if (isGold && gramsNum) {
          perGram = goldPerGramIDR(prices)
          computedValue = Math.round(gramsNum * perGram)
        } else if (isCurrency && fxAmountNum) {
          const rate = idrPerUnit(prices, fxCode)
          if (rate !== null) computedValue = Math.round(fxAmountNum * rate)
        }
      } catch {
        setFetchNote('Could not fetch the live price right now — value will update on the next refresh.')
      }
    }

    const data = {
      name,
      lane: TYPE_LANE[assetType],
      asset_type: assetType,
      value: computedValue,
      quantity_grams: isGold ? gramsNum : null,
      price_per_gram: isGold ? perGram : null,
      auto_price: isGold && autoGold ? ('gold_spot' as const) : isCurrency ? ('fx' as const) : null,
      fx_code: isCurrency ? fxCode : null,
      fx_amount: isCurrency ? fxAmountNum : null,
      last_valued_at: today,
      note: null,
    }
    if (editing?.id) {
      await assetsRepo.update(editing.id, data)
    } else {
      await assetsRepo.create(data)
    }
    setSaving(false)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit asset' : 'Add asset'} height="85dvh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Asset name *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold 37g, RDPU Bibit" />
        </Field>
        <Field label="Asset type">
          <Select value={assetType} onChange={(e) => { setAssetType(e.target.value as AssetType) }}>
            {ASSET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>

        {isGold && (
          <>
            <Field label="Weight (grams)">
              <Input type="text" inputMode="numeric" mono value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="37" />
            </Field>
            <ToggleRow
              label="Auto-update from market price"
              sub="Gold spot (XAU/USD × kurs) per gram, refreshed daily"
              checked={autoGold}
              onChange={setAutoGold}
            />
            {!autoGold && (
              <Field label="Price per gram (Rp)">
                <Input type="text" inputMode="numeric" mono value={pricePerGram} onChange={(e) => setPricePerGram(e.target.value)} placeholder="1.400.000" />
              </Field>
            )}
            {computedGoldValue !== null && (
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                Computed value: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
                  Rp {computedGoldValue.toLocaleString('id-ID')}
                </span>
              </div>
            )}
          </>
        )}

        {isCurrency && (
          <>
            <Field label="Currency">
              <Select value={fxCode} onChange={(e) => setFxCode(e.target.value)}>
                {FX_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label={`Amount held (${fxCode})`}>
              <Input type="text" inputMode="decimal" mono value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} placeholder="e.g. 500" />
            </Field>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', lineHeight: 1.5 }}>
              IDR value is fetched from today's exchange rate and refreshed automatically every day.
            </div>
          </>
        )}

        {!isGold && !isCurrency && (
          <Field label="Current value (Rp)">
            <Input type="text" inputMode="numeric" mono value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 5.000.000" />
          </Field>
        )}

        {fetchNote && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--amber-text)' }}>{fetchNote}</div>
        )}

        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          Lane auto-set to <strong style={{ color: 'var(--ink-2)' }}>{TYPE_LANE[assetType].replace(/_/g, ' ')}</strong> based on asset type.
        </div>

        <Btn onClick={handleSave} disabled={saving || !name} fullWidth>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add asset'}
        </Btn>
      </div>
    </BottomSheet>
  )
}

function ToggleRow({
  label, sub, checked, onChange,
}: {
  label: string; sub: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 10,
        padding: '11px 13px', cursor: 'pointer', width: '100%', textAlign: 'left',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-1)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{
        width: 38, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? 'var(--amber)' : 'var(--bg-3)',
        border: '1px solid var(--border-2)', position: 'relative', transition: 'background .15s',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: 8, background: checked ? 'var(--on-accent)' : 'var(--ink-3)',
          position: 'absolute', top: 2, left: checked ? 18 : 2, transition: 'left .15s',
        }} />
      </div>
    </button>
  )
}
