import { BottomSheet } from '@components/BottomSheet'
import { Badge, type BadgeTone, Row } from '@components/ui'
import { AVAILABLE_MODELS, type ModelConfig } from '../../ai/models'

interface Props {
  open: boolean
  onClose: () => void
  currentModel: string
  onSelect: (modelId: string) => void
}

// costTier -> <Badge> tone. 'free'/'standard' aren't in the list yet, but the
// mapping is total so a future tier doesn't fall through to an unstyled badge.
const TIER_TONE: Record<ModelConfig['costTier'], BadgeTone> = {
  free: 'positive',
  standard: 'default',
  premium: 'warning',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  return `${(n / 1_000).toFixed(0)}K`
}

// M2 fix: rows show `m.name` (a human label, e.g. "Claude Sonnet") — the raw
// `m.id` model-ID string is never rendered, only sent as the stored value via
// onSelect(m.id).
export function ModelPicker({ open, onClose, currentModel, onSelect }: Props) {
  function handleSelect(m: ModelConfig) {
    onSelect(m.id)
    onClose()
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Choose model"
      height="50dvh"
    >
      <div>
        {AVAILABLE_MODELS.map((m) => {
          const isActive = m.id === currentModel
          return (
            <Row
              key={m.id}
              onClick={() => handleSelect(m)}
              primary={m.name}
              caption={`${formatTokens(m.contextWindow)} context · ${formatTokens(m.maxOutput)} output`}
              right={<Badge tone={TIER_TONE[m.costTier]}>{m.costTier}</Badge>}
              {...(isActive
                ? { style: { background: 'var(--amber-surface)' } }
                : {})}
              aria-label={isActive ? `${m.name} (current model)` : m.name}
            />
          )
        })}
      </div>
    </BottomSheet>
  )
}
