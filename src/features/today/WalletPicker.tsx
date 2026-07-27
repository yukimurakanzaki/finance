import { BottomSheet } from '@components/BottomSheet'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { formatRp } from '@lib/currency'
import type { Account } from '@db/types'

interface Props {
  open: boolean
  onClose: () => void
  accounts: Account[]
  excludeId?: string | undefined
  onSelect: (account: Account) => void
}

// Reference-app pattern: grid of wallet tiles, each showing its live balance.
export function WalletPicker({ open, onClose, accounts, excludeId, onSelect }: Props) {
  const balances = useAccountBalances()
  return (
    <BottomSheet open={open} onClose={onClose} title="Select wallet">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
        {accounts.filter((a) => a.id !== excludeId).map((a) => (
          <button
            key={a.id}
            onClick={() => { onSelect(a); onClose() }}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--space-2)',
              paddingBlock: 'var(--space-3)', paddingInline: 'var(--space-1)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)',
            }}
          >
            <span style={{ fontSize: 'var(--text-section)', fontWeight: 600, color: 'var(--ink-1)' }}>{a.name}</span>
            <span style={{ fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              {balances ? formatRp(balances.balances.get(a.id as string) ?? 0) : '—'}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
