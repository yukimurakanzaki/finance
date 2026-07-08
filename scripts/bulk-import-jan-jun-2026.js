// Bulk import script for Jan-Jun 2026 transactions
// Run this in your browser's DevTools console while the Finance PWA is open.
// It loads data/transactions-jan-jun-2026.json and inserts it into IndexedDB.

(async function runBulkImport() {
  const DB_NAME = 'fi-dashboard-v2'
  const db = await openDatabase(DB_NAME)

  // 1. Load transaction JSON
  const res = await fetch('/data/transactions-jan-jun-2026.json')
  if (!res.ok) {
    console.error('Failed to load transaction JSON:', res.status, res.statusText)
    return
  }
  const rows = await res.json()
  console.log(`Loaded ${rows.length} transaction rows`)

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error('No transaction rows found.')
    return
  }

  // 2. Validate required fields
  const required = ['date', 'amount', 'direction', 'account_id', 'suggested_lane']
  const invalid = rows.filter((r) => required.some((k) => r[k] === undefined || r[k] === ''))
  if (invalid.length > 0) {
    console.error('Invalid rows found:', invalid.slice(0, 5))
    return
  }

  // 3. Detect duplicates against existing transactions
  const existing = await getAllRecords(db, 'transactions')
  const existingKeys = new Set(
    existing.map((t) => `${t.date}|${t.account_id}|${t.amount}|${t.direction}`),
  )

  // 4. Build transaction records
  const now = new Date().toISOString()
  const toInsert = []
  const skipped = []
  for (const row of rows) {
    const key = `${row.date}|${row.account_id}|${row.amount}|${row.direction}`
    if (existingKeys.has(key)) {
      skipped.push({ row, reason: 'Duplicate' })
      continue
    }
    toInsert.push({
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      account_id: row.account_id,
      category_id: null,
      lane: row.suggested_lane,
      source: 'csv_import',
      note: row.note || null,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: false,
      transfer_pair_id: null,
      created_at: now,
      updated_at: now,
    })
  }

  // 5. Insert in batches
  const BATCH = 100
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    await addRecords(db, 'transactions', batch)
    console.log(`Inserted batch ${i / BATCH + 1}/${Math.ceil(toInsert.length / BATCH)} (${batch.length} rows)`)
  }

  console.log('====================================')
  console.log('IMPORT COMPLETE')
  console.log('To insert:', toInsert.length)
  console.log('Skipped:', skipped.length)
  if (skipped.length > 0) {
    console.log('Skipped rows:', skipped.slice(0, 20))
  }
  console.log('====================================')

  // 6. Run transfer detection
  await detectAndFlagTransfers(db)

  // Helpers using raw IndexedDB
  function openDatabase(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  function getAllRecords(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  function addRecords(db, storeName, records) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      for (const r of records) store.add(r)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async function detectAndFlagTransfers(db) {
    const txns = await getAllRecords(db, 'transactions')
    const ownAccountIds = [...new Set(txns.map((t) => t.account_id))]
    const outs = txns.filter((t) => t.direction === 'out' && ownAccountIds.includes(t.account_id))
    const ins = txns
      .filter((t) => t.direction === 'in' && ownAccountIds.includes(t.account_id))
      .sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date))
    const usedIn = new Set()
    let count = 0
    for (const out of outs) {
      const match = findMatch(ins, out, usedIn)
      if (match) {
        const pairId = crypto.randomUUID()
        await updateRecord(db, 'transactions', out.id, { is_transfer: true, transfer_pair_id: pairId })
        await updateRecord(db, 'transactions', match.id, { is_transfer: true, transfer_pair_id: pairId })
        usedIn.add(match.id)
        count++
      }
    }
    console.log(`Flagged ${count} transfer pairs`)
  }

  function findMatch(sortedIns, out, usedIn) {
    let lo = 0, hi = sortedIns.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (sortedIns[mid].amount < out.amount) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < sortedIns.length; i++) {
      const row = sortedIns[i]
      if (row.amount !== out.amount) break
      if (usedIn.has(row.id)) continue
      if (row.account_id === out.account_id) continue
      if (Math.abs(new Date(row.date).getTime() - new Date(out.date).getTime()) / 86400000 > 1) continue
      return row
    }
    return null
  }

  function updateRecord(db, storeName, id, patch) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.get(id)
      req.onsuccess = () => {
        const existing = req.result
        if (!existing) return resolve()
        Object.assign(existing, patch)
        const putReq = store.put(existing)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      req.onerror = () => reject(req.error)
    })
  }
})()