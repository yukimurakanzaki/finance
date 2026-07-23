import type { ValidImportRow } from '../../import/schema'

type ExclusionRow = Pick<
  ValidImportRow,
  '_row_index' | 'is_transfer' | 'transfer_pair_id'
>

// A transfer is TWO rows sharing one transfer_pair_id — import/parser.ts flags
// both the out leg and the in leg. Any exclude/include in the reconcile UI must
// therefore cover the whole pair: excluding a single leg would commit the other,
// balance-breaking half to importBatch on its own (P1 — orphaned transfer).
//
// Returns every `_row_index` that must toggle together with `rowIndex`: the
// whole transfer pair for a transfer leg, otherwise just the row itself. A row
// with no transfer_pair_id (or a missing row) toggles only itself.
export function exclusionGroup(
  rows: ExclusionRow[],
  rowIndex: number,
): number[] {
  const row = rows.find((r) => r._row_index === rowIndex)
  if (row?.is_transfer && row.transfer_pair_id) {
    return rows
      .filter((r) => r.transfer_pair_id === row.transfer_pair_id)
      .map((r) => r._row_index)
  }
  return [rowIndex]
}
