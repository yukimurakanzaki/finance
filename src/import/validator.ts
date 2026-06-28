import type { ImportRow, FieldError } from './schema'

const LANE_VALUES = [
  'income_producing',
  'store_of_value',
  'debt_liability',
  'protected_living',
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateRow(
  raw: unknown,
  rowIndex: number,
): { ok: true; row: ImportRow } | { ok: false; errors: FieldError[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: '_row', message: 'Not a valid JSON object' }] }
  }

  const obj = raw as Record<string, unknown>
  const errors: FieldError[] = []

  // date
  if (!obj['date'] || typeof obj['date'] !== 'string' || !DATE_RE.test(obj['date'])) {
    errors.push({ field: 'date', message: 'Required YYYY-MM-DD format' })
  }

  // amount
  if (typeof obj['amount'] !== 'number' || obj['amount'] <= 0) {
    errors.push({ field: 'amount', message: 'Must be a positive number' })
  }

  // direction
  if (obj['direction'] !== 'in' && obj['direction'] !== 'out') {
    errors.push({ field: 'direction', message: 'Must be "in" or "out"' })
  }

  // account_id
  if (!obj['account_id'] || typeof obj['account_id'] !== 'string') {
    errors.push({ field: 'account_id', message: 'Required string matching an active account' })
  }

  // category (required but can be empty string)
  if (obj['category'] === undefined || obj['category'] === null) {
    errors.push({ field: 'category', message: 'Required (can be empty string)' })
  }

  // suggested_lane
  if (!obj['suggested_lane'] || !LANE_VALUES.includes(obj['suggested_lane'] as string)) {
    errors.push({ field: 'suggested_lane', message: `Must be one of: ${LANE_VALUES.join(', ')}` })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    row: {
      date: obj['date'] as string,
      amount: obj['amount'] as number,
      direction: obj['direction'] as 'in' | 'out',
      account_id: obj['account_id'] as string,
      category: (obj['category'] as string) ?? '',
      suggested_lane: obj['suggested_lane'] as ImportRow['suggested_lane'],
      note: typeof obj['note'] === 'string' ? obj['note'] : '',
    },
  }
}
