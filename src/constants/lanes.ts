import type { Lane } from '@db/types'

export const LANE_LABELS: Record<Lane, string> = {
  income_producing: 'Income Producing',
  store_of_value: 'Store of Value',
  debt_liability: 'Debt / Liability',
  protected_living: 'Protected Living',
  pass_through: 'Pass-through',
}

export const LANE_COLORS: Record<Lane, string> = {
  income_producing: 'var(--engine)',
  store_of_value: 'var(--store)',
  debt_liability: 'var(--debt)',
  protected_living: 'var(--protected)',
  pass_through: 'var(--ink-3)',
}

export const ALL_LANES: Lane[] = [
  'income_producing',
  'store_of_value',
  'debt_liability',
  'protected_living',
  'pass_through',
]

// Lanes that count toward the household's own wealth and spending math.
// pass_through is tracked and reconciled but excluded from every personal aggregate.
export const PERSONAL_LANES: Lane[] = [
  'income_producing',
  'store_of_value',
  'debt_liability',
  'protected_living',
]
