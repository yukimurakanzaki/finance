import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'
import { LanePill } from '@components/LanePill'
import { todayISO } from '@lib/dates'

export function AssetsScreen() {
  const accounts = useLiveQuery(() => db.accounts.filter((a: import('@db/types').Account) => a.is_active).toArray())
  const assets = useLiveQuery(() => db.assets.toArray())
  const today = todayISO()

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Accounts */}
      <section>
        <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
          Accounts
        </div>
        {accounts?.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No accounts added yet.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts?.map((acc) => (
            <div
              key={acc.id}
              style={{
                background: 'var(--bg-1)', borderRadius: 10,
                border: '1px solid var(--border-1)', padding: '12px 14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
            </div>
          ))}
        </div>
      </section>

      {/* Assets */}
      <section>
        <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
          Assets
        </div>
        {assets?.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No assets added yet.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assets?.map((asset) => {
            const daysSince = (new Date(today).getTime() - new Date(asset.last_valued_at).getTime()) / 86_400_000
            const stale = daysSince > 30 && asset.asset_type === 'gold'
            return (
              <div
                key={asset.id}
                style={{
                  background: 'var(--bg-1)', borderRadius: 10,
                  border: `1px solid ${stale ? 'var(--amber-border)' : 'var(--border-1)'}`,
                  padding: '12px 14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{asset.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                    {asset.asset_type.replace(/_/g, ' ')}
                    {asset.quantity_grams && ` · ${asset.quantity_grams}g`}
                  </div>
                  <div style={{ marginTop: 5, display: 'flex', gap: 5, alignItems: 'center' }}>
                    <LanePill lane={asset.lane} size="xs" />
                    {stale && (
                      <span style={{ fontSize: 9, color: 'var(--amber-text)', letterSpacing: '.3px' }}>
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
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
