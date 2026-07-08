import type { Lane } from '@db/types'
import { LANE_LABELS } from '../constants/lanes'

const LANE_STYLE: Record<Lane, { bg: string; color: string }> = {
  income_producing: { bg: 'var(--engine-bg)', color: 'var(--engine)' },
  store_of_value:   { bg: 'var(--store-bg)',   color: 'var(--store)' },
  debt_liability:   { bg: 'var(--debt-bg)',     color: 'var(--debt)' },
  protected_living: { bg: 'var(--protected-bg)', color: 'var(--protected)' },
  pass_through:     { bg: 'var(--bg-3)', color: 'var(--ink-2)' },
}

interface Props {
  lane: Lane
  size?: 'sm' | 'xs'
}

export function LanePill({ lane, size = 'sm' }: Props) {
  const { bg, color } = LANE_STYLE[lane]
  return (
    <span
      style={{
        display: 'inline-block',
        background: bg,
        color,
        borderRadius: 4,
        fontSize: size === 'xs' ? 9 : 10,
        fontWeight: 600,
        letterSpacing: '.3px',
        padding: size === 'xs' ? '1px 5px' : '2px 7px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {LANE_LABELS[lane]}
    </span>
  )
}
