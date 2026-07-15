export type Lane =
  | 'income_producing'
  | 'store_of_value'
  | 'debt_liability'
  | 'protected_living'
  // Money that flows through the household's accounts but isn't theirs
  // (group collections, held funds). Excluded from net worth, savings rate,
  // safe-to-spend, and FI projection — reported separately.
  | 'pass_through'

export type AccountType = 'bank' | 'digital_wallet' | 'cash'

export type RecurringKind =
  | 'pay_yourself_first'
  | 'household_bill'
  | 'personal_sub'
  | 'other'

export type TransactionSource = 'manual' | 'claude_import' | 'csv_import'

export type AssetType =
  | 'investment_rdpu'
  | 'investment_equity'
  | 'gold'
  | 'dplk'
  | 'storyforge'
  | 'currency'
  | 'other'

// Assets that track a live market price instead of a manually entered value.
// 'gold_spot' — XAU/USD spot × USD/IDR, per gram. 'fx' — foreign currency holding.
export type AutoPriceSource = 'gold_spot' | 'fx'

export type EnvelopeHorizon = 'yearly' | 'monthly' | 'weekly'

export type MilestoneStatus = 'pending' | 'triggered' | 'done' | 'skipped'

export type Cadence = 'monthly' | 'weekly' | 'yearly' | 'one_off'

export interface Account {
  id?: string
  name: string
  institution: string
  account_type: AccountType
  lane: Lane
  currency: string
  is_protected: boolean
  is_active: boolean
  manual_balance_override: number | null
  last_balance_updated_at: string | null
  created_at: string
}

export interface Asset {
  id?: string
  name: string
  lane: Lane
  asset_type: AssetType
  value: number
  quantity_grams: number | null
  price_per_gram: number | null
  auto_price: AutoPriceSource | null
  fx_code: string | null
  fx_amount: number | null
  last_valued_at: string
  note: string | null
  created_at: string
}

export interface Transaction {
  id?: string
  date: string
  amount: number
  title: string | null
  direction: 'in' | 'out'
  account_id: string
  category_id: string | null
  lane: Lane
  source: TransactionSource
  note: string | null
  original_amount: number | null
  overridden_amount: number | null
  override_note: string | null
  overridden_at: string | null
  is_transfer: boolean
  transfer_pair_id: string | null
  // Set when this expense pays a configured recurring item (bill/sub/PYF). Such
  // committed payments live in the recurring bucket and are excluded from the
  // personal safe-to-spend pool draw. null for ordinary discretionary spend.
  recurring_item_id: string | null
  created_at: string
}

export interface Category {
  id?: string
  name: string
  lane: Lane
  is_protected: boolean
  envelope_id: string | null
}

export interface Envelope {
  id?: string
  name: string
  horizon: EnvelopeHorizon
  target_amount: number
  period: string
  parent_envelope_id: string | null
  created_at: string
}

export interface RecurringItem {
  id?: string
  name: string
  amount: number
  cadence: Cadence
  kind: RecurringKind
  lane: Lane
  is_protected: boolean
  is_active: boolean
  next_due: string
  end_date: string | null
  note: string | null
  created_at: string
}

export interface Allowance {
  id?: string
  monthly_amount: number
  weekend_allocation: number
  updated_at: string
}

export interface NetWorthSnapshot {
  id?: string
  year_month: string
  total: number
  by_lane: Record<Lane, number>
  taken_at: string
}

export interface IncomeEvent {
  id?: string
  date: string
  gross: number
  take_home_net: number
  delta_vs_prev: number | null
  routed_to_pipe: number
  routed_to_lifestyle: number
  note: string | null
  source: 'manual' | 'seed'
  created_at: string
}

export interface Milestone {
  id?: string
  title: string
  description: string | null
  flag_date: string | null
  status: MilestoneStatus
  source: string | null
  income_event_id: string | null
  created_at: string
}

export interface Assumptions {
  id?: string
  target_low: number
  target_high: number
  return_rdpu: number
  return_equity: number
  return_dplk: number
  return_gold: number
  inflation_rate: number
  equity_switch_month: number
  lifestyle_ceiling_monthly: number | null
  updated_at: string
}

export interface AppSetting {
  key: string
  value: string
  updated_at: string
}

export type AppSettingKey =
  | 'last_exported_at'
  | 'setup_complete'
  | 'onboarding_step'
  | 'onboarding_draft'
  | 'reconcile_in_progress'
  | 'ios_install_banner_dismissed'
  | 'gold_staleness_dismissed_at'
  | 'prices_last_refreshed_at'
  | 'prices_cached'
  | 'language'
  | 'theme'
  | `seeded:${string}`

// --- Chat session management ---

export interface ChatSession {
  id: string
  title: string
  model: string
  skills: string[]
  archived_at: string | null
  created_at: string
  updated_at: string
  message_count: number
  total_input_tokens: number
  total_output_tokens: number
}

// One row per API-format message. `content` is JSON:
// either a plain string or an array of content blocks (text/image/tool_use/tool_result/thinking).
export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  updated_at: string
}

export interface ChatMemory {
  id: string
  content: string
  source_session_id: string | null
  created_at: string
  updated_at: string
}

export interface ChatCustomSkill {
  id: string
  name: string
  description: string
  icon: string
  prompt_injection: string
  source_session_id: string | null
  created_at: string
  updated_at: string
}
