import type { Account, Category, Lane } from '@db/types'

export interface ImportRow {
  date: string
  amount: number
  direction: 'in' | 'out'
  account_id: string
  category: string
  suggested_lane: Lane
  note: string
}

export interface ValidImportRow extends ImportRow {
  _row_index: number
  _resolved_account: Account
  _resolved_category: Category | null
  // Set by transfer detector worker
  is_transfer?: boolean
  transfer_pair_id?: string | null
  // Recurring-item link decided in the reconcile confirm screen (auto-matched
  // by description against active recurring items, user-dismissible before
  // import). undefined = not yet decided by the UI, in which case importBatch
  // falls back to its own auto-match; null = explicitly not linked.
  recurring_item_id?: string | null
}

export interface InvalidImportRow {
  _row_index: number
  _raw: Partial<ImportRow>
  errors: FieldError[]
}

export interface DuplicateImportRow {
  _row_index: number
  incoming: ImportRow
  existing_transaction_id: string
  import_anyway: boolean
}

export interface FieldError {
  field: keyof ImportRow | '_row'
  message: string
}

export interface ParseResult {
  valid: ValidImportRow[]
  invalid: InvalidImportRow[]
  duplicates: DuplicateImportRow[]
}
