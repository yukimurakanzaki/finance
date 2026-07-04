import type { ValidImportRow } from '../import/schema'

export interface DetectTransfersRequest {
  type: 'DETECT_TRANSFERS'
  rows: ValidImportRow[]
  own_account_ids: string[]
}

export interface DetectTransfersResponse {
  type: 'DETECT_TRANSFERS_RESULT'
  rows: ValidImportRow[]
  transfer_count: number
  duration_ms: number
}

// O(n log n): sort by [amount, date], binary search for matches within ±1 day
self.onmessage = (e: MessageEvent<DetectTransfersRequest>) => {
  if (e.data.type !== 'DETECT_TRANSFERS') return
  const t0 = performance.now()
  const { rows, own_account_ids } = e.data

  const ownSet = new Set(own_account_ids)
  const outs = rows.filter(
    (r) => r.direction === 'out' && ownSet.has(r._resolved_account.id!),
  )
  const ins = rows
    .filter((r) => r.direction === 'in' && ownSet.has(r._resolved_account.id!))
    .sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date))

  const usedIn = new Set<number>()
  let count = 0

  for (const out of outs) {
    const match = binaryFindMatch(ins, out, usedIn)
    if (match !== null) {
      const pairId = crypto.randomUUID()
      out.is_transfer = true
      out.transfer_pair_id = pairId
      match.is_transfer = true
      match.transfer_pair_id = pairId
      usedIn.add(match._row_index)
      count++
    }
  }

  const response: DetectTransfersResponse = {
    type: 'DETECT_TRANSFERS_RESULT',
    rows,
    transfer_count: count,
    duration_ms: performance.now() - t0,
  }
  self.postMessage(response)
}

function binaryFindMatch(
  sortedIns: ValidImportRow[],
  out: ValidImportRow,
  usedIn: Set<number>,
): ValidImportRow | null {
  // Find first index where amount >= out.amount
  let lo = 0
  let hi = sortedIns.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const row = sortedIns[mid]
    if (row && row.amount < out.amount) lo = mid + 1
    else hi = mid
  }
  // Scan forward while amount matches
  for (let i = lo; i < sortedIns.length; i++) {
    const row = sortedIns[i]
    if (!row || row.amount !== out.amount) break
    if (usedIn.has(row._row_index)) continue
    if (row._resolved_account.id === out._resolved_account.id) continue // same account
    if (Math.abs(dateDiff(row.date, out.date)) > 1) continue
    return row
  }
  return null
}

function dateDiff(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000
}
