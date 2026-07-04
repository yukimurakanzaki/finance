import type { Lane, Account, Category } from '@db/types'

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
