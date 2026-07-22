import { LanePill } from '@components/LanePill'
import {
  Amount,
  Badge,
  Card,
  Row,
  Screen,
  SectionHeader,
  StatTile,
} from '@components/ui'
import { db } from '@db/db'
import type { Account, Asset } from '@db/types'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { refreshAssetPrices } from '@lib/marketPrices'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { AccountForm } from './AccountForm'
import { AssetForm } from './AssetForm'

export function AssetsScreen() {
  const accounts = useLiveQuery(() =>
    db.accounts.filter((a) => a.is_active).toArray(),
  )
  const assets = useLiveQuery(() => db.assets.toArray())
  const lastRefreshed = useLiveQuery(() =>
    db.appSettings.get('prices_last_refreshed_at'),
  )
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
      setRefreshError(
        'Could not reach the price APIs. Check your connection and try again.',
      )
    }
    setRefreshing(false)
  }

  function openAddAccount() {
    setEditingAccount(undefined)
    setAccountFormOpen(true)
  }
  function openEditAccount(a: Account) {
    setEditingAccount(a)
    setAccountFormOpen(true)
  }
  function openAddAsset() {
    setEditingAsset(undefined)
    setAssetFormOpen(true)
  }
  function openEditAsset(a: Asset) {
    setEditingAsset(a)
    setAssetFormOpen(true)
  }

  return (
    <Screen>
      {/* Total balance — the screen's one hero number (Calm Ledger v2 §2). */}
      <Card>
        <StatTile
          label="Total balance"
          size="display"
          value={
            accountBalances ? <Amount value={accountBalances.total} /> : '—'
          }
        />
      </Card>

      {/* Accounts */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <SectionHeader>Accounts ({accounts?.length ?? 0})</SectionHeader>
          <button type="button" onClick={openAddAccount} style={addBtnStyle}>
            + Add
          </button>
        </div>
        {accounts?.length === 0 && (
          <div style={emptyStyle}>
            No accounts yet. Add your main spending account.
          </div>
        )}
        <div>
          {accounts?.map((acc) => (
            <Row
              key={acc.id}
              onClick={() => openEditAccount(acc)}
              primary={acc.name}
              caption={
                <span
                  style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  <span>
                    {acc.institution} · {acc.account_type.replace('_', ' ')}
                  </span>
                  <LanePill lane={acc.lane} size="xs" />
                </span>
              }
              right={
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 2,
                  }}
                >
                  {accountBalances ? (
                    <Amount
                      value={
                        accountBalances.balances.get(acc.id as string) ?? 0
                      }
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 'var(--text-body)',
                        lineHeight: 'var(--leading-body)',
                        fontWeight: 500,
                        color: 'var(--ink-1)',
                      }}
                    >
                      —
                    </span>
                  )}
                  {acc.manual_balance_override !== null &&
                    acc.last_balance_updated_at && (
                      <span
                        style={{
                          fontSize: 'var(--text-caption)',
                          lineHeight: 'var(--leading-caption)',
                          color: 'var(--ink-3)',
                        }}
                      >
                        {acc.last_balance_updated_at}
                      </span>
                    )}
                </span>
              }
            />
          ))}
        </div>
      </section>

      {/* Assets */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <SectionHeader>Assets ({assets?.length ?? 0})</SectionHeader>
          <button type="button" onClick={openAddAsset} style={addBtnStyle}>
            + Add
          </button>
        </div>
        {hasAutoAssets && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}
            >
              {lastRefreshed
                ? `Prices refreshed ${new Date(lastRefreshed.value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
                : 'Prices not fetched yet'}
            </div>
            <button
              type="button"
              onClick={handleRefreshPrices}
              disabled={refreshing}
              style={{ ...refreshBtnStyle, opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh prices'}
            </button>
          </div>
        )}
        {refreshError && (
          <div
            role="alert"
            style={{ fontSize: 'var(--text-caption)', color: '#ef4444' }}
          >
            {refreshError}
          </div>
        )}
        {assets?.length === 0 && (
          <div style={emptyStyle}>
            No assets yet. Add your investments, gold, DPLK.
          </div>
        )}
        <div>
          {assets?.map((asset) => {
            const daysSince =
              (new Date(today).getTime() -
                new Date(asset.last_valued_at).getTime()) /
              86_400_000
            const stale =
              daysSince > 30 &&
              asset.asset_type === 'gold' &&
              asset.auto_price === null
            return (
              <Row
                key={asset.id}
                onClick={() => openEditAsset(asset)}
                primary={asset.name}
                caption={
                  <span
                    style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <span>
                      {asset.asset_type.replace(/_/g, ' ')}
                      {asset.quantity_grams
                        ? ` · ${asset.quantity_grams}g`
                        : ''}
                      {asset.fx_code && asset.fx_amount
                        ? ` · ${asset.fx_amount} ${asset.fx_code}`
                        : ''}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        gap: 'var(--space-1)',
                        alignItems: 'center',
                      }}
                    >
                      <LanePill lane={asset.lane} size="xs" />
                      {asset.auto_price !== null && (
                        <Badge tone="positive">Auto</Badge>
                      )}
                      {stale && <Badge tone="warning">Price stale</Badge>}
                    </span>
                  </span>
                }
                right={
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 2,
                    }}
                  >
                    <Amount value={asset.value} />
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        lineHeight: 'var(--leading-caption)',
                        color: 'var(--ink-3)',
                      }}
                    >
                      {asset.last_valued_at}
                    </span>
                  </span>
                }
              />
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
    </Screen>
  )
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-body)',
}

const addBtnStyle: React.CSSProperties = {
  background: 'var(--amber)',
  border: 'none',
  borderRadius: 8,
  padding: 'var(--space-1) var(--space-3)',
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  color: 'var(--on-accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
}

const refreshBtnStyle: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: 'var(--space-1) var(--space-3)',
  fontSize: 'var(--text-caption)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
}
