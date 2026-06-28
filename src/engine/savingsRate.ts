export interface SavingsRateInput {
  takeHomeNet: number
  pipeMonthlyActive: number
}

export interface SavingsRateResult {
  rate: number
  pipe_total: number
  take_home_net: number
  is_null: boolean
}

export function computeSavingsRate(input: SavingsRateInput): SavingsRateResult {
  const { takeHomeNet, pipeMonthlyActive } = input
  if (takeHomeNet === 0) {
    return { rate: 0, pipe_total: pipeMonthlyActive, take_home_net: 0, is_null: true }
  }
  const rate = Math.min(1, Math.max(0, pipeMonthlyActive / takeHomeNet))
  return { rate, pipe_total: pipeMonthlyActive, take_home_net: takeHomeNet, is_null: false }
}
