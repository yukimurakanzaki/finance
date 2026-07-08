// Bulk import script for Jan-Jun 2026 transactions
// Run this in your browser's DevTools console while the Finance PWA is open.
// It will prompt you to paste your markdown export, then parse and insert it.

(async function runBulkImport() {
  const DB_NAME = 'fi-dashboard-v2'
  const db = await openDatabase(DB_NAME)

  // 1. Prompt for the markdown data via a large textarea overlay
  const raw = await promptForMarkdown()
  if (!raw || !raw.trim()) {
    console.log('No data pasted. Cancelled.')
    return
  }

  // 2. Parse markdown tables
  const rows = []
  const lines = raw.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || trimmed.includes('---')) continue
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
    if (cells.length < 6) continue

    const [dateRaw, amountRaw, direction, account, category, lane, ...noteParts] = cells

    // Fix common OCR/date typos first, then validate
    let date = dateRaw.replaceAll('/', '-')
    date = date.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$2-$4')
    date = date.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$4-$5')
    date = date.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$2-$5')
    if (!/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(date)) continue

    const amount = parseFloat(amountRaw.replace(/\./g, '').replace(',', '.'))
    if (Number.isNaN(amount) || amount <= 0) continue

    const note = noteParts.join(' | ').trim()
    const mappedLane = lane === 'external_pool' ? 'pass_through' : lane || 'protected_living'

    rows.push({
      date,
      amount,
      direction: direction === 'in' ? 'in' : 'out',
      account: account.toLowerCase(),
      category,
      lane: mappedLane,
      note,
    })
  }

  console.log(`Parsed ${rows.length} transaction rows`)

  if (rows.length === 0) {
    console.error('No valid transaction rows found. Make sure you pasted the full markdown tables.')
    return
  }

  // Helper: create a textarea overlay for large paste
  function promptForMarkdown() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99999;
        display: flex; align-items: center; justify-content: center; font-family: sans-serif;
      `
      const box = document.createElement('div')
      box.style.cssText = `
        background: #fff; color: #111; width: 90vw; max-width: 800px; height: 80vh;
        border-radius: 12px; display: flex; flex-direction: column; padding: 20px; box-sizing: border-box;
      `
      box.innerHTML = `
        <h3 style="margin:0 0 12px;font-size:16px;">Paste transaction markdown export</h3>
        <p style="margin:0 0 12px;font-size:12px;color:#555;">
          Copy your full transaction export (all tables from Jan–Jun 2026) and paste it below, then click Import.
        </p>
        <textarea id="bulk-import-ta" style="flex:1;width:100%;font-family:monospace;font-size:12px;padding:10px;border:1px solid #ccc;border-radius:8px;resize:none;box-sizing:border-box;"></textarea>
        <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end;">
          <button id="bulk-import-cancel" style="padding:8px 16px;border:1px solid #ccc;background:#f5f5f5;border-radius:6px;cursor:pointer;">Cancel</button>
          <button id="bulk-import-ok" style="padding:8px 16px;border:none;background:#f59e0b;color:#000;font-weight:600;border-radius:6px;cursor:pointer;">Import</button>
        </div>
      `
      overlay.appendChild(box)
      document.body.appendChild(overlay)
      const ta = box.querySelector('#bulk-import-ta')
      ta.focus()

      box.querySelector('#bulk-import-cancel').addEventListener('click', () => {
        document.body.removeChild(overlay)
        resolve('')
      })
      box.querySelector('#bulk-import-ok').addEventListener('click', () => {
        const value = ta.value
        document.body.removeChild(overlay)
        resolve(value)
      })
    })
  }

  // 3. Ensure accounts exist
  const accountSpecs = [
    { name: 'blu', institution: 'BCA Digital / blu', type: 'bank' },
    { name: 'BCA', institution: 'Bank Central Asia', type: 'bank' },
  ]
  const accounts = await getAllRecords(db, 'accounts')
  const activeAccounts = accounts.filter((a) => a.is_active)
  const accountMap = {}
  for (const spec of accountSpecs) {
    const existing = activeAccounts.find(
      (a) => a.name.toLowerCase() === spec.name.toLowerCase(),
    )
    if (existing) {
      accountMap[spec.name.toLowerCase()] = existing.id
      console.log('Using existing account:', existing.name, existing.id)
    } else {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const record = {
        id,
        name: spec.name,
        institution: spec.institution,
        account_type: spec.type,
        lane: 'protected_living',
        currency: 'IDR',
        is_protected: false,
        is_active: true,
        manual_balance_override: null,
        last_balance_updated_at: null,
        created_at: now,
        updated_at: now,
      }
      await putRecord(db, 'accounts', record)
      accountMap[spec.name.toLowerCase()] = id
      console.log('Created account:', spec.name, id)
    }
  }

  // 4. Ensure categories exist
  const categories = await getAllRecords(db, 'categories')
  const categoryMap = {}
  const uniqueCategories = new Map()
  for (const row of rows) {
    const key = row.category.toLowerCase() + '|' + row.lane
    if (!uniqueCategories.has(key)) {
      uniqueCategories.set(key, { name: row.category, lane: row.lane })
    }
  }
  for (const { name, lane } of uniqueCategories.values()) {
    const existing = categories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.lane === lane,
    )
    if (existing) {
      categoryMap[name.toLowerCase() + '|' + lane] = existing.id
    } else {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const record = {
        id,
        name,
        lane,
        is_protected: lane === 'protected_living',
        envelope_id: null,
        created_at: now,
        updated_at: now,
      }
      await putRecord(db, 'categories', record)
      categoryMap[name.toLowerCase() + '|' + lane] = id
      console.log('Created category:', name, lane)
    }
  }

  // 5. Detect duplicates against existing transactions
  const existing = await getAllRecords(db, 'transactions')
  const existingKeys = new Set(
    existing.map((t) => `${t.date}|${t.account_id}|${t.amount}|${t.direction}`),
  )

  // 6. Build transaction records
  const now = new Date().toISOString()
  const toInsert = []
  const skipped = []
  for (const row of rows) {
    const accountId = accountMap[row.account]
    if (!accountId) {
      skipped.push({ row, reason: 'Unknown account' })
      continue
    }
    const key = `${row.date}|${accountId}|${row.amount}|${row.direction}`
    if (existingKeys.has(key)) {
      skipped.push({ row, reason: 'Duplicate' })
      continue
    }
    const categoryId = categoryMap[row.category.toLowerCase() + '|' + row.lane] ?? null
    toInsert.push({
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      account_id: accountId,
      category_id: categoryId,
      lane: row.lane,
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

  // 7. Insert in batches
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

  // 8. Run transfer detection
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

  function putRecord(db, storeName, record) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.put(record)
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