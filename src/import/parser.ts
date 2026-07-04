import { db } from '@db/db'
import type { ParseResult, ValidImportRow, InvalidImportRow, DuplicateImportRow } from './schema'
import { validateRow } from './validator'
import type { DetectTransfersRequest, DetectTransfersResponse } from '../workers/transferDetector'

export async function parseImportJSON(raw: string): Promise<ParseResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      valid: [],
      invalid: [{ _row_index: 0, _raw: {}, errors: [{ field: '_row', message: 'Invalid JSON' }] }],
      duplicates: [],
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      valid: [],
      invalid: [{ _row_index: 0, _raw: {}, errors: [{ field: '_row', message: 'Expected a JSON array' }] }],
      duplicates: [],
    }
  }

  const accounts = await db.accounts.filter((a) => a.is_active).toArray()
  const categories = await db.categories.toArray()
  const accountMap = new Map(accounts.map((a) => [String(a.id), a]))

  const valid: ValidImportRow[] = []
  const invalid: InvalidImportRow[] = []
  const duplicates: DuplicateImportRow[] = []

  for (let i = 0; i < parsed.length; i++) {
    const result = validateRow(parsed[i], i)
    if (!result.ok) {
      invalid.push({ _row_index: i, _raw: (parsed[i] as Record<string, unknown>) ?? {}, errors: result.errors })
      continue
    }

    const row = result.row
    const account = accountMap.get(row.account_id)
    if (!account) {
      invalid.push({
        _row_index: i,
        _raw: row,
        errors: [{ field: 'account_id', message: `No active account found with id "${row.account_id}"` }],
      })
      continue
    }

    // Duplicate detection
    const dup = await db.transactions
      .where('[date+account_id]')
      .equals([row.date, account.id!])
      .filter((t) => t.amount === row.amount && t.direction === row.direction)
      .first()

    if (dup) {
      duplicates.push({
        _row_index: i,
        incoming: row,
        existing_transaction_id: dup.id!,
        import_anyway: false,
      })
      continue
    }

    const resolvedCategory =
      categories.find(
        (c) => c.name.toLowerCase() === row.category.toLowerCase() && c.lane === row.suggested_lane,
      ) ?? null

    valid.push({
      ...row,
      _row_index: i,
      _resolved_account: account,
      _resolved_category: resolvedCategory,
    })
  }

  return { valid, invalid, duplicates }
}

export function detectTransfersAsync(
  rows: ValidImportRow[],
  ownAccountIds: string[],
): Promise<ValidImportRow[]> {
  return new Promise((resolve, reject) => {
    const workerCode = `
      ${transferWorkerSource()}
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))

    worker.onmessage = (e: MessageEvent<DetectTransfersResponse>) => {
      worker.terminate()
      resolve(e.data.rows)
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }

    const req: DetectTransfersRequest = {
      type: 'DETECT_TRANSFERS',
      rows,
      own_account_ids: ownAccountIds,
    }
    worker.postMessage(req)
  })
}

// Inline worker source — avoids bundler worker config complexity
function transferWorkerSource(): string {
  return `
self.onmessage = function(e) {
  if (e.data.type !== 'DETECT_TRANSFERS') return;
  var t0 = performance.now();
  var rows = e.data.rows;
  var ownSet = new Set(e.data.own_account_ids);
  var outs = rows.filter(function(r) { return r.direction === 'out' && ownSet.has(r._resolved_account.id); });
  var ins = rows.filter(function(r) { return r.direction === 'in' && ownSet.has(r._resolved_account.id); })
    .sort(function(a, b) { return a.amount - b.amount || a.date.localeCompare(b.date); });
  var usedIn = new Set();
  var count = 0;
  for (var oi = 0; oi < outs.length; oi++) {
    var out = outs[oi];
    var match = findMatch(ins, out, usedIn);
    if (match) {
      var pairId = crypto.randomUUID();
      out.is_transfer = true; out.transfer_pair_id = pairId;
      match.is_transfer = true; match.transfer_pair_id = pairId;
      usedIn.add(match._row_index);
      count++;
    }
  }
  self.postMessage({ type: 'DETECT_TRANSFERS_RESULT', rows: rows, transfer_count: count, duration_ms: performance.now() - t0 });
};
function findMatch(sortedIns, out, usedIn) {
  var lo = 0, hi = sortedIns.length;
  while (lo < hi) { var mid = (lo + hi) >>> 1; if (sortedIns[mid].amount < out.amount) lo = mid + 1; else hi = mid; }
  for (var i = lo; i < sortedIns.length; i++) {
    var row = sortedIns[i];
    if (row.amount !== out.amount) break;
    if (usedIn.has(row._row_index)) continue;
    if (row._resolved_account.id === out._resolved_account.id) continue;
    if (Math.abs((new Date(row.date).getTime() - new Date(out.date).getTime()) / 86400000) > 1) continue;
    return row;
  }
  return null;
}
  `
}
