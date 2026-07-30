import { useI18n } from '@i18n/index'
import { useState } from 'react'
import { IncomeLog } from './IncomeLog'
import { Milestones } from './Milestones'
import { SpendingLens } from './SpendingLens'

type Tab = 'lens' | 'income' | 'milestones'

export function DecideScreen() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('lens')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'lens', label: t.decide.spendingLens },
    { id: 'income', label: t.decide.incomeLog },
    { id: 'milestones', label: t.decide.milestones },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--bg-1)',
          flexShrink: 0,
        }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: 'var(--space-2) 0',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 'var(--text-caption)',
              fontWeight: tab === id ? 600 : 400,
              fontFamily: 'var(--font-ui)',
              background: tab === id ? 'var(--amber)' : 'var(--bg-2)',
              color: tab === id ? 'var(--on-accent)' : 'var(--ink-2)',
              transition: 'background .15s, color .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-4) var(--space-4) var(--space-6)',
        }}
      >
        {tab === 'lens' && <SpendingLens />}
        {tab === 'income' && <IncomeLog />}
        {tab === 'milestones' && <Milestones />}
      </div>
    </div>
  )
}
