import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'
import { LanePill } from '@components/LanePill'
import { todayISO } from '@lib/dates'
import { AccountForm } from './AccountForm'
import { AssetForm } from './AssetForm'
import type { Account, Asset } from '@db/types'

export function AssetsScreen() {
  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).toArray())
  const assets = useLiveQuery(() => db.assets.toArray())
  const today = todayISO()

  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | undefined>()
  const [assetFormOpen, setAssetFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>()

  function openAddAccount() { setEditingAccount(undefined); setAccountFormOpen(true) }
  function openEditAccount(a: Account) { setEditingAccount(a); setAccountFormOpen(true) }
  function openAddAsset() { setEditingAsset(undefined); setAssetFormOpen(true) }
  function openEditAsset(a: Asset) { setEditingAsset(a); setAssetFormOpen(true) }

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Accounts */}
      <section>
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
              {acc.account_type !== 'bank' && acc.manual_balance_override !== null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {formatRp(acc.manual_balance_override)}
                  </div>
                  {acc.last_balance_updated_at && (
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                      {acc.last_balance_updated_at}
                    </div>
                  )}
                </div>
              )}
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
        {assets?.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No assets yet. Add your investments, gold, DPLK.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assets?.map((asset) => {
            const daysSince = (new Date(today).getTime() - new Date(asset.last_valued_at).getTime()) / 86_400_000
            const stale = daysSince > 30 && asset.asset_type === 'gold'
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
                  </div>
                  <div style={{ marginTop: 5, display: 'flex', gap: 5, alignItems: 'center' }}>
                    <LanePill lane={asset.lane} size="xs" />
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
