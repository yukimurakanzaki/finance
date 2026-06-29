import { useState } from 'react'
import { assetsRepo } from '@db/repositories/assets.repo'
import { BottomSheet } from '@components/BottomSheet'
import { Field, Input, Select, Btn } from '@components/FormField'
import { todayISO } from '@lib/dates'
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
  { value: 'dplk', label: 'DPLK / Pensiun' },
  { value: 'storyforge', label: 'Storyforge / Business equity' },
  { value: 'other', label: 'Other' },
]

const TYPE_LANE: Record<AssetType, Lane> = {
  investment_rdpu: 'income_producing',
  investment_equity: 'income_producing',
  gold: 'store_of_value',
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
  const [saving, setSaving] = useState(false)

  const isGold = assetType === 'gold'
  const computedGoldValue = isGold && grams && pricePerGram
    ? Number(grams.replace(/[.,]/g, '')) * Number(pricePerGram.replace(/[.,]/g, ''))
    : null

  async function handleSave() {
    if (!name) return
    setSaving(true)
    const today = todayISO()
    const computedValue = computedGoldValue ?? Number(value.replace(/[.,]/g, ''))
    const data = {
      name,
      lane: TYPE_LANE[assetType],
      asset_type: assetType,
      value: computedValue,
      quantity_grams: isGold && grams ? Number(grams.replace(/[.,]/g, '')) : null,
      price_per_gram: isGold && pricePerGram ? Number(pricePerGram.replace(/[.,]/g, '')) : null,
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

        {isGold ? (
          <>
            <Field label="Weight (grams)">
              <Input type="text" inputMode="numeric" mono value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="37" />
            </Field>
            <Field label="Price per gram (Rp)">
              <Input type="text" inputMode="numeric" mono value={pricePerGram} onChange={(e) => setPricePerGram(e.target.value)} placeholder="1.400.000" />
            </Field>
            {computedGoldValue !== null && (
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                Computed value: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
                  Rp {computedGoldValue.toLocaleString('id-ID')}
                </span>
              </div>
            )}
          </>
        ) : (
          <Field label="Current value (Rp)">
            <Input type="text" inputMode="numeric" mono value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 5.000.000" />
          </Field>
        )}

        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Lane auto-set to <strong style={{ color: 'var(--ink-2)' }}>{TYPE_LANE[assetType].replace(/_/g, ' ')}</strong> based on asset type.
        </div>

        <Btn onClick={handleSave} disabled={saving || !name} fullWidth>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add asset'}
        </Btn>
      </div>
    </BottomSheet>
  )
}
