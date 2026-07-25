import { BottomSheet } from '@components/BottomSheet'
import { Icon } from '@components/ui'
import { useAppStore } from '@stores/appStore'
import { useState } from 'react'
import { TransactionHistory } from './TransactionHistory'
import { MonthlyScreen } from './monthly/MonthlyScreen'
import { SafeToSpendScreen } from './weekly/SafeToSpendScreen'
import { YearlyScreen } from './yearly/YearlyScreen'

export function BudgetScreen() {
  const { budgetHorizon, setBudgetHorizon } = useAppStore()
  const [historyOpen, setHistoryOpen] = useState(false)

  const horizons: { id: 'yearly' | 'monthly' | 'weekly'; label: string }[] = [
    { id: 'yearly', label: 'Yearly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly', label: 'Weekly' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Segment control */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--bg-1)',
        }}
      >
        {horizons.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setBudgetHorizon(h.id)}
            style={{
              flex: 1,
              padding: 'var(--space-2) 0',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 'var(--text-caption)',
              fontWeight: budgetHorizon === h.id ? 600 : 400,
              fontFamily: 'var(--font-ui)',
              background:
                budgetHorizon === h.id ? 'var(--amber)' : 'var(--bg-2)',
              color:
                budgetHorizon === h.id ? 'var(--on-accent)' : 'var(--ink-2)',
              transition: 'background .15s, color .15s',
            }}
          >
            {h.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {budgetHorizon === 'weekly' && <SafeToSpendScreen />}
        {budgetHorizon === 'monthly' && <MonthlyScreen />}
        {budgetHorizon === 'yearly' && <YearlyScreen />}
      </div>

      {/* Transactions link */}
      <div
        style={{
          borderTop: '1px solid var(--border-1)',
          background: 'var(--bg-1)',
          padding: 'var(--space-3) var(--space-4)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 'var(--text-caption)',
            color: 'var(--amber-text)',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
          }}
        >
          View all transactions <Icon name="chevron-right" size={14} />
        </button>
      </div>

      <BottomSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Transaction history"
        height="92dvh"
      >
        <TransactionHistory />
      </BottomSheet>
    </div>
  )
}
