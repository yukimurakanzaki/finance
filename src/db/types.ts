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
  // D1 — this row is a balance correction, not real spending: the user told us
  // what the account actually holds and we booked the gap. It moves the account
  // balance and net worth, but is excluded from the safe-to-spend draw, the
  // daily leftover ledger, the category breakdown and Report actuals.
  // Optional, not required: rows written before this field existed carry
  // undefined, so every reader tests truthiness — never `=== false`. Clearing
  // it (by giving the row a category) turns it into an ordinary transaction.
  is_adjustment?: boolean
  created_at: string
  /**
   * Stamped by the Dexie `creating`/`updating` hooks on every synced table and
   * used as the watermark the push filters on. Optional because no caller sets
   * it by hand — declared so the rare write that must stamp it explicitly (a
   * `.modify()`, which bypasses those hooks) can be type-checked.
   */
  updated_at?: string
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
  deleted_at?: string | null
}

// D1 — append-only audit of every balance correction. One row per correction,
// pointing at the adjustment transaction it created, so "who changed this and
// when" has an answer in a two-member household. Never edited in place: an undo
// appends a reverting row carrying `reverts_id`.
//
// The watermark sync engine has no delete channel: it pushes rows whose
// updated_at moved, so a row deleted locally just stops being pushed. The cloud
// copy survives, every other device keeps it forever, and a fresh hydrate pulls
// it straight back onto this one. Every delete in the app had this shape.
//
// A deletion log fixes it without tombstoning the rows themselves. The local
// row is genuinely removed — so the ~55 places that read db.transactions need
// no "and not deleted" clause, and none of them can forget one — and this small
// synced record carries the fact of the deletion to the other devices.
//
// `id` is deliberately the deleted row's own id: deleting twice writes the same
// record instead of a second one.
export interface Deletion {
  id?: string
  /** Local Dexie table the row lived in, e.g. 'transactions'. */
  table_name: string
  row_id: string
  created_at: string
}

export interface BalanceCorrection {
  id?: string
  account_id: string
  /** The adjustment transaction this correction wrote; null on a reverting row. */
  transaction_id: string | null
  /** Set on a reverting row: the correction it undoes. */
  reverts_id: string | null
  previous_balance: number
  new_balance: number
  as_of_date: string
  note: string | null
  /**
   * Who made it. Never written by this client: SEC-2 requires attribution to
   * come from the authenticated session, so the column is left off the pushed
   * row entirely and the cloud's `default auth.uid()` stamps it. Populated on
   * rows that come back from a pull. An explicit null would defeat that
   * default, which is why the repo omits the key rather than setting it.
   */
  created_by?: string | null
  created_at: string
  /**
   * Stamped by the Dexie `creating`/`updating` hooks on every synced table and
   * used as the watermark the push filters on. Optional because no caller sets
   * it by hand — declared so the rare write that must stamp it explicitly (a
   * `.modify()`, which bypasses those hooks) can be type-checked.
   */
  updated_at?: string
}

export interface Allowance {
  id?: string
  monthly_amount: number
  weekend_allocation: number
  // ISO datetime. While set in the future (assembled against `todayISO()`),
  // the AI context suppresses the ONBOARDING STATE section entirely. null =
  // never snoozed. T1a §7 / TR-1.1.
  onboarding_snoozed_until: string | null
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
  deleted_at?: string | null
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

// Audit E1: per-device idempotency ledger for AI write confirmations. When
// the user approves a `ConfirmCard`, the chat store generates an operation_id
// (UUID), runs the writes, then records the operation here with the final
// result JSON. A retry of the same id (e.g. double-tap, network blip, app
// reload before the API acknowledged) reads back this row and returns the
// stored result without re-executing — making confirm→commit exactly-once
// client-side today and ready to hand off to a server `operations` table when
// the Phase B RPC routing lands.
export interface AiOperation {
  id: string // operation_id (UUID)
  session_id: string
  tool_name: string // e.g. 'log_transactions', 'create_account'
  // JSON-stringified tool result, identical shape to what executeWriteTool
  // returns. Stored verbatim so retries see exactly what the user approved.
  result_json: string
  created_at: string
}
