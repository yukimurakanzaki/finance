import type { AssetType, Assumptions } from '@db/types'
import { REAL_RETURN_RATES } from './returnRates'

export interface FIProjectionInput {
  assumptions: Assumptions
  currentAssets: Record<AssetType, number>
  pipeMonthlyActive: number
  currentDate: Date
}

export interface FIProjectionResult {
  fi_date_path_b: Date | null
  fi_date_path_a: Date | null
  gap_to_low: number
  gap_to_high: number
  total_current: number
  years_to_fi_path_b: number | null
  years_to_fi_path_a: number | null
  path_b_vs_a_savings_years: number | null
}

const MAX_YEARS = 60
const STEPS_PER_YEAR = 12

// Path A: all pipe goes to RDPU the whole time
// Path B: first equity_switch_month months go RDPU, then equity
function project(
  startValue: number,
  pipeMonthly: number,
  target: number,
  assumptions: Assumptions,
  pathB: boolean,
): number | null {
  let value = startValue
  const switchMonth = assumptions.equity_switch_month
  const rdpuRate = assumptions.return_rdpu / 12
  const equityRate = assumptions.return_equity / 12

  for (let month = 1; month <= MAX_YEARS * STEPS_PER_YEAR; month++) {
    const rate =
      pathB && month > switchMonth ? equityRate : rdpuRate
    value = value * (1 + rate) + pipeMonthly
    if (value >= target) return month / STEPS_PER_YEAR
  }
  return null
}

export function computeFIProjection(input: FIProjectionInput): FIProjectionResult {
  const { assumptions, currentAssets, pipeMonthlyActive, currentDate } = input

  // Sum FI-eligible assets using real return rates (storyforge and other = 0, excluded from projection)
  const total_current = (Object.keys(currentAssets) as AssetType[]).reduce(
    (sum, type) => sum + (currentAssets[type] ?? 0),
    0,
  )

  const gap_to_low = Math.max(0, assumptions.target_low - total_current)
  const gap_to_high = Math.max(0, assumptions.target_high - total_current)

  function yearsToDate(years: number | null): Date | null {
    if (years === null) return null
    const d = new Date(currentDate)
    d.setMonth(d.getMonth() + Math.round(years * 12))
    return d
  }

  // Use weighted portfolio return for Path A (blend of current mix)
  const totalNonZero = (Object.keys(currentAssets) as AssetType[])
    .filter((t) => REAL_RETURN_RATES[t] > 0)
    .reduce((s, t) => s + (currentAssets[t] ?? 0), 0)

  const weightedReturn =
    totalNonZero > 0
      ? (Object.keys(currentAssets) as AssetType[]).reduce((s, t) => {
          const v = currentAssets[t] ?? 0
          return s + (v / totalNonZero) * REAL_RETURN_RATES[t]
        }, 0)
      : assumptions.return_rdpu

  // Path A: current weighted blend, constant
  const yearsA = projectCustomRate(total_current, pipeMonthlyActive, assumptions.target_low, weightedReturn)
  // Path B: RDPU switch → equity
  const yearsB = project(total_current, pipeMonthlyActive, assumptions.target_low, assumptions, true)

  const savingsYears =
    yearsA !== null && yearsB !== null ? Math.round((yearsA - yearsB) * 10) / 10 : null

  return {
    fi_date_path_b: yearsToDate(yearsB),
    fi_date_path_a: yearsToDate(yearsA),
    gap_to_low,
    gap_to_high,
    total_current,
    years_to_fi_path_b: yearsB,
    years_to_fi_path_a: yearsA,
    path_b_vs_a_savings_years: savingsYears,
  }
}

function projectCustomRate(
  startValue: number,
  pipeMonthly: number,
  target: number,
  annualRate: number,
): number | null {
  let value = startValue
  const monthlyRate = annualRate / 12
  for (let month = 1; month <= MAX_YEARS * STEPS_PER_YEAR; month++) {
    value = value * (1 + monthlyRate) + pipeMonthly
    if (value >= target) return month / STEPS_PER_YEAR
  }
  return null
}
