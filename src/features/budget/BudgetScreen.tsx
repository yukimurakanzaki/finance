import { useState } from 'react'
import { useAppStore } from '@stores/appStore'
import { SafeToSpendScreen } from './weekly/SafeToSpendScreen'
import { MonthlyScreen } from './monthly/MonthlyScreen'
import { YearlyScreen } from './yearly/YearlyScreen'
import { TransactionHistory } from './TransactionHistory'
import { BottomSheet } from '@components/BottomSheet'

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
      <div style={{
        display: 'flex', gap: 6, padding: '12px 16px',
        borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)',
      }}>
        {horizons.map((h) => (
          <button
            key={h.id}
            onClick={() => setBudgetHorizon(h.id)}
            style={{
              flex: 1, padding: '7px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: budgetHorizon === h.id ? 600 : 400,
              fontFamily: 'var(--font-ui)',
              background: budgetHorizon === h.id ? 'var(--amber)' : 'var(--bg-2)',
              color: budgetHorizon === h.id ? 'var(--on-accent)' : 'var(--ink-2)',
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
      <div style={{
        borderTop: '1px solid var(--border-1)', background: 'var(--bg-1)',
        padding: '10px 16px', flexShrink: 0,
      }}>
        <button
          onClick={() => setHistoryOpen(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 12, color: 'var(--amber-text)', fontFamily: 'var(--font-ui)', fontWeight: 600,
          }}
        >
          View all transactions →
        </button>
      </div>

      <BottomSheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Transaction history" height="92dvh">
        <TransactionHistory />
      </BottomSheet>
    </div>
  )
}
