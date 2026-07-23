import { useWorkweek } from '../../../hooks/useWorkweek'

export function DayDots() {
  const { dayLabels } = useWorkweek()

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {dayLabels.map((d) => (
        <div
          key={d.iso}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `1.5px solid ${d.state === 'today' ? 'var(--amber)' : d.state === 'spent' ? 'var(--border-2)' : 'var(--border-1)'}`,
              background:
                d.state === 'today'
                  ? 'var(--amber)'
                  : d.state === 'spent'
                    ? 'var(--bg-3)'
                    : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {d.state === 'spent' && (
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--ink-3)',
                }}
              />
            )}
          </div>
          <span
            style={{
              fontSize: 'var(--text-caption)',
              color:
                d.state === 'today'
                  ? 'var(--amber-text)'
                  : d.state === 'spent'
                    ? 'var(--ink-3)'
                    : 'var(--ink-3)',
              fontWeight: d.state === 'today' ? 600 : 400,
            }}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}
