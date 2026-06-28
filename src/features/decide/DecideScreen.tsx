export function DecideScreen() {
  return (
    <div style={{ padding: 20 }}>
      <div style={{
        background: 'var(--bg-2)', borderRadius: 12,
        border: '1px solid var(--border-1)', padding: 20,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>
          Decision Lens
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Before you spend, ask: which lane does this serve?<br />
          Income-producing assets compound. Protected living is maintenance.
          Lifestyle inflation is the enemy.
        </div>
        <div style={{ marginTop: 16, padding: 12, background: 'var(--amber-surface)', borderRadius: 8, border: '1px solid var(--amber-border)' }}>
          <div style={{ fontSize: 11, color: 'var(--amber-text)' }}>
            Full spending lens, raise tracker, and milestone viewer — coming in next sprint.
          </div>
        </div>
      </div>
    </div>
  )
}
