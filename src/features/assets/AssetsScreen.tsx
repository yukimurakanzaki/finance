import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'
import { LanePill } from '@components/LanePill'
import { todayISO } from '@lib/dates'
import { refreshAssetPrices } from '@lib/marketPrices'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { AccountForm } from './AccountForm'
import { AssetForm } from './AssetForm'
import type { Account, Asset } from '@db/types'

export function AssetsScreen() {
  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).toArray())
  const assets = useLiveQuery(() => db.assets.toArray())
  const lastRefreshed = useLiveQuery(() => db.appSettings.get('prices_last_refreshed_at'))
  const accountBalances = useAccountBalances()
  const today = todayISO()

  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | undefined>()
  const [assetFormOpen, setAssetFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const hasAutoAssets = assets?.some((a) => a.auto_price !== null) ?? false

  async function handleRefreshPrices() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await refreshAssetPrices(true)
    } catch {
      setRefreshError('Could not reach the price APIs. Check your connection and try again.')
    }
    setRefreshing(false)
  }

  function openAddAccount() { setEditingAccount(undefined); setAccountFormOpen(true) }
  function openEditAccount(a: Account) { setEditingAccount(a); setAccountFormOpen(true) }
  function openAddAsset() { setEditingAsset(undefined); setAssetFormOpen(true) }
  function openEditAsset(a: Asset) { setEditingAsset(a); setAssetFormOpen(true) }

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Accounts */}
      <section>
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10,
          padding: '12px 14px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 10,
        }}>
          <span style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Total balance
          </span>
          <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-1)' }}>
            {accountBalances ? formatRp(accountBalances.total) : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Accounts ({accounts?.length ?? 0})
          </div>
          <button onClick={openAddAccount} style={addBtnStyle}>+ Add</button>
        </div>
        {accounts?.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No accounts yet. Add your main spending account.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts?.map((acc) => (
            <button
              key={acc.id}
              onClick={() => openEditAccount(acc)}
              style={{
                background: 'var(--bg-1)', borderRadius: 10,
                border: '1px solid var(--border-1)', padding: '12px 14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-ui)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{acc.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {acc.institution} · {acc.account_type.replace('_', ' ')}
                </div>
                <div style={{ marginTop: 5 }}>
                  <LanePill lane={acc.lane} size="xs" />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-1)' }}>
                  {accountBalances ? formatRp(accountBalances.balances.get(acc.id as string) ?? 0) : '—'}
                </div>
                {acc.manual_balance_override !== null && acc.last_balance_updated_at && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                    {acc.last_balance_updated_at}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Assets */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Assets ({assets?.length ?? 0})
          </div>
          <button onClick={openAddAsset} style={addBtnStyle}>+ Add</button>
        </div>
        {hasAutoAssets && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
              {lastRefreshed
                ? `Prices refreshed ${new Date(lastRefreshed.value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
                : 'Prices not fetched yet'}
            </div>
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              style={{
                background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8,
                padding: '5px 12px', fontSize: 11, color: 'var(--ink-2)', cursor: refreshing ? 'default' : 'pointer',
                fontFamily: 'var(--font-ui)', opacity: refreshing ? .6 : 1,
              }}
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh prices'}
            </button>
          </div>
        )}
        {refreshError && (
          <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{refreshError}</div>
        )}
        {assets?.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No assets yet. Add your investments, gold, DPLK.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assets?.map((asset) => {
            const daysSince = (new Date(today).getTime() - new Date(asset.last_valued_at).getTime()) / 86_400_000
            const stale = daysSince > 30 && asset.asset_type === 'gold' && asset.auto_price === null
            return (
              <button
                key={asset.id}
                onClick={() => openEditAsset(asset)}
                style={{
                  background: 'var(--bg-1)', borderRadius: 10, textAlign: 'left',
                  border: `1px solid ${stale ? 'var(--amber-border)' : 'var(--border-1)'}`,
                  padding: '12px 14px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-ui)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{asset.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                    {asset.asset_type.replace(/_/g, ' ')}
                    {asset.quantity_grams ? ` · ${asset.quantity_grams}g` : ''}
                    {asset.fx_code && asset.fx_amount ? ` · ${asset.fx_amount} ${asset.fx_code}` : ''}
                  </div>
                  <div style={{ marginTop: 5, display: 'flex', gap: 5, alignItems: 'center' }}>
                    <LanePill lane={asset.lane} size="xs" />
                    {asset.auto_price !== null && (
                      <span style={{ fontSize: 9, color: 'var(--engine, #34d399)', letterSpacing: '.3px', fontWeight: 600 }}>
                        AUTO
                      </span>
                    )}
                    {stale && (
                      <span style={{ fontSize: 9, color: 'var(--amber-text)', letterSpacing: '.3px', fontWeight: 600 }}>
                        PRICE STALE
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {formatRp(asset.value)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                    {asset.last_valued_at}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <AccountForm
        open={accountFormOpen}
        onClose={() => setAccountFormOpen(false)}
        editing={editingAccount}
      />
      <AssetForm
        open={assetFormOpen}
        onClose={() => setAssetFormOpen(false)}
        editing={editingAsset}
      />
    </div>
  )
}

const addBtnStyle: React.CSSProperties = {
  background: 'var(--amber)', border: 'none', borderRadius: 8,
  padding: '5px 13px', fontSize: 12, fontWeight: 700,
  color: '#000', cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
