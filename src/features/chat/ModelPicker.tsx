import { AVAILABLE_MODELS, type ModelConfig } from '../../ai/models'
import { BottomSheet } from '@components/BottomSheet'

interface Props {
  open: boolean
  onClose: () => void
  currentModel: string
  onSelect: (modelId: string) => void
}

const TIER_COLORS: Record<string, string> = {
  free: '#22c55e',
  standard: '#f59e0b',
  premium: '#a855f7',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  return `${(n / 1_000).toFixed(0)}K`
}

export function ModelPicker({ open, onClose, currentModel, onSelect }: Props) {
  function handleSelect(m: ModelConfig) {
    onSelect(m.id)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose model" height="50dvh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {AVAILABLE_MODELS.map((m) => {
          const isActive = m.id === currentModel
          return (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '14px', borderRadius: 12,
                background: isActive ? 'var(--amber-bg)' : 'var(--bg-2)',
                border: `1px solid ${isActive ? 'var(--amber)' : 'var(--border-1)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
                  {m.name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px',
                  borderRadius: 4, textTransform: 'uppercase',
                  background: `${TIER_COLORS[m.costTier]}20`,
                  color: TIER_COLORS[m.costTier],
                }}>
                  {m.costTier}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {formatTokens(m.contextWindow)} context · {formatTokens(m.maxOutput)} output
              </div>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
