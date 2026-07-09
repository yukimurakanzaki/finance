interface Props {
  children: React.ReactNode
  onDismiss?: () => void
}

export function AmberBanner({ children, onDismiss }: Props) {
  return (
    <div className="amber-banner" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }}>◉</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--amber-dim)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
