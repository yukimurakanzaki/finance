// Live market prices from free, keyless, CORS-enabled APIs:
// - Gold spot (XAU/USD): api.gold-api.com
// - FX rates (USD base, includes IDR): open.er-api.com
// Assets with auto_price set get their value recomputed from these.

import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { todayISO } from './dates'

const GOLD_API = 'https://api.gold-api.com/price/XAU'
const FX_API = 'https://open.er-api.com/v6/latest/USD'
const TROY_OUNCE_GRAMS = 31.1034768
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12h → max ~1 refresh/day in practice

export const FX_CODES = ['USD', 'SGD', 'EUR', 'JPY', 'GBP', 'AUD', 'MYR', 'CNY'] as const

export interface MarketPrices {
  xau_usd: number // spot price per troy ounce
  usd_idr: number
  // 1 USD = rates[code] units of that currency
  rates: Record<string, number>
  fetched_at: string
}

export interface RefreshResult {
  skipped: boolean
  updated_count: number
  gold_per_gram_idr: number | null
  usd_idr: number | null
}

export async function fetchMarketPrices(): Promise<MarketPrices> {
  const [goldRes, fxRes] = await Promise.all([fetch(GOLD_API), fetch(FX_API)])
  if (!goldRes.ok) throw new Error(`Gold price API returned ${goldRes.status}`)
  if (!fxRes.ok) throw new Error(`FX rate API returned ${fxRes.status}`)

  const gold = (await goldRes.json()) as { price?: number }
  const fx = (await fxRes.json()) as { result?: string; rates?: Record<string, number> }

  if (typeof gold.price !== 'number' || gold.price <= 0) throw new Error('Gold API returned no price')
  if (fx.result !== 'success' || typeof fx.rates?.['IDR'] !== 'number') {
    throw new Error('FX API returned no IDR rate')
  }

  return {
    xau_usd: gold.price,
    usd_idr: fx.rates['IDR'],
    rates: fx.rates,
    fetched_at: new Date().toISOString(),
  }
}

export function goldPerGramIDR(p: MarketPrices): number {
  return Math.round((p.xau_usd / TROY_OUNCE_GRAMS) * p.usd_idr)
}

// IDR value of 1 unit of `code` (e.g. 1 USD, 1 SGD)
export function idrPerUnit(p: MarketPrices, code: string): number | null {
  if (code === 'USD') return p.usd_idr
  const perUsd = p.rates[code]
  if (typeof perUsd !== 'number' || perUsd <= 0) return null
  return p.usd_idr / perUsd
}

// Recompute values of all auto-priced assets. Skips silently (skipped: true)
// when a refresh ran within the last 12h, unless force is set.
export async function refreshAssetPrices(force = false): Promise<RefreshResult> {
  const none: RefreshResult = { skipped: true, updated_count: 0, gold_per_gram_idr: null, usd_idr: null }

  if (!force) {
    const last = await settingsRepo.get('prices_last_refreshed_at')
    if (last && Date.now() - new Date(last).getTime() < REFRESH_INTERVAL_MS) return none
  }

  const autoAssets = await db.assets.filter((a) => a.auto_price !== null).toArray()
  if (autoAssets.length === 0) return none

  const prices = await fetchMarketPrices()
  const perGram = goldPerGramIDR(prices)
  const today = todayISO()

  let updated = 0
  for (const asset of autoAssets) {
    if (asset.auto_price === 'gold_spot' && asset.quantity_grams) {
      await db.assets.update(asset.id!, {
        price_per_gram: perGram,
        value: Math.round(asset.quantity_grams * perGram),
        last_valued_at: today,
      })
      updated++
    } else if (asset.auto_price === 'fx' && asset.fx_code && asset.fx_amount) {
      const rate = idrPerUnit(prices, asset.fx_code)
      if (rate === null) continue
      await db.assets.update(asset.id!, {
        value: Math.round(asset.fx_amount * rate),
        last_valued_at: today,
      })
      updated++
    }
  }

  await settingsRepo.set('prices_last_refreshed_at', prices.fetched_at)
  return {
    skipped: false,
    updated_count: updated,
    gold_per_gram_idr: perGram,
    usd_idr: Math.round(prices.usd_idr),
  }
}
