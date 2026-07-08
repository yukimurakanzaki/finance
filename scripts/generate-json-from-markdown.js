import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sourcePath = 'c:/Users/0471250923/Downloads/Pasted markdown (2).md'
const outPath = path.join(__dirname, '..', 'data', 'transactions-jan-jun-2026.json')

const ACCOUNT_MAP = {
  blu: 'ae6044b4-7aa9-42b9-8610-66f0e89fb56e',
  BCA: '0d1db08b-888b-402c-a700-9f68f68c6fd7',
}

const raw = fs.readFileSync(sourcePath, 'utf-8')
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

  const [dateRaw, amountRaw, direction, account, _category, lane, ...noteParts] = cells

  // Fix common OCR/date typos first, then validate
  let date = dateRaw.replaceAll('/', '-')
  date = date.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$2-$4')
  date = date.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$4-$5')
  date = date.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$2-$5')
  if (!/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(date)) continue

  const amount = parseFloat(amountRaw.replace(/\./g, '').replace(',', '.'))
  if (Number.isNaN(amount) || amount <= 0) continue

  const rawNote = noteParts.join(' | ').trim()
  // Preserve category description in note since category field is left empty
  const note = rawNote
    ? `${_category} - ${rawNote}`
    : _category
  const mappedLane = lane === 'external_pool' ? 'pass_through' : lane || 'protected_living'
  const accountId = ACCOUNT_MAP[account]
  if (!accountId) {
    console.warn('Unknown account:', account, line)
    continue
  }

  rows.push({
    date,
    amount,
    direction: direction === 'in' ? 'in' : 'out',
    account_id: accountId,
    category: '',
    suggested_lane: mappedLane,
    note,
  })
}

console.log(`Parsed ${rows.length} transaction rows`)

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8')
console.log(`Wrote JSON to ${outPath}`)