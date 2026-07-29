import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = 'http://localhost:5173'
const OUT = 'smoke-out'
fs.mkdirSync(OUT, { recursive: true })

const errors = []
const log = (...a) => console.log('[smoke]', ...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  hasTouch: true,
})
const page = await ctx.newPage()
page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); log('PAGEERROR', e.message) })
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); log('CON', m.type(), m.text()) })

// Clean IndexedDB so onboarding is fresh
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  const dbs = await indexedDB.databases?.() ?? []
  for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/00-loaded.png`, fullPage: true })

// Auth gate — use pre-confirmed test account from prod memory
await page.waitForTimeout(300)
const TEST_EMAIL = process.env.SMOKE_TEST_EMAIL ?? 'dev@example.com'
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD ?? 'placeholder'
const emailIn = page.locator('input[type="email"]').first()
await emailIn.fill(TEST_EMAIL)
const pwIn = page.locator('input[type="password"]').first()
await pwIn.fill(TEST_PASSWORD)
await page.screenshot({ path: `${OUT}/00c-signup.png`, fullPage: true })
await page.getByRole('button', { name: 'Sign in', exact: true }).click()
await page.waitForTimeout(3500)

// ---- Mode picker ----
try {
  await page.waitForSelector('text=Welcome', { timeout: 12000 })
} catch (e) {
  await page.screenshot({ path: `${OUT}/00b-stuck.png`, fullPage: true })
  const html = await page.content()
  fs.writeFileSync(`${OUT}/00b-stuck.html`, html)
  throw e
}
await page.screenshot({ path: `${OUT}/00-mode-picker.png`, fullPage: true })
await page.getByText('Full setup').click()

// ---- Step 1 ----
try {
  await page.waitForSelector('text=Your take-home income', { timeout: 12000 })
} catch (e) {
  await page.screenshot({ path: `${OUT}/00b2-stuck.png`, fullPage: true })
  const html = await page.content()
  fs.writeFileSync(`${OUT}/00b2-stuck.html`, html)
  throw e
}
await page.screenshot({ path: `${OUT}/01-step1.png`, fullPage: true })
const grossIn = page.locator('input').nth(0)
await grossIn.fill('15000000')
const takeIn = page.locator('input').nth(1)
await takeIn.fill('12500000')
// Confirm live-format on Take-home: expect dots
const takeVal = await takeIn.inputValue()
log('Take-home typed:', takeVal)
if (takeVal !== '12.500.000') errors.push(`Take-home format wrong: ${takeVal}`)
await page.getByRole('button', { name: 'Continue' }).click()

// ---- Step 2 (Pipes + DPLK) ----
await page.waitForSelector('text=Pipe & DPLK', { timeout: 10000 })
const pipeAmount = page.locator('input[placeholder="500.000"]').first()
await pipeAmount.fill('500000')
const pipeVal = await pipeAmount.inputValue()
log('Pipe 1 amount typed:', pipeVal)
if (pipeVal !== '500.000') errors.push(`Pipe format wrong: ${pipeVal}`)
await page.locator('input[placeholder="e.g. 500.000"]').fill('200000')
await page.screenshot({ path: `${OUT}/02-step2.png`, fullPage: true })
await page.getByRole('button', { name: 'Continue' }).click()

// ---- Step 3 (Allowance) ----
await page.waitForSelector('text=Personal allowance', { timeout: 10000 })
const monthly = page.locator('input[placeholder="e.g. 2.500.000"]')
await monthly.fill('2500000')
const weekend = page.locator('input[placeholder="e.g. 800.000"]')
await weekend.fill('800000')
await page.screenshot({ path: `${OUT}/03-step3.png`, fullPage: true })
await page.getByRole('button', { name: 'Continue' }).click()

// ---- Step 4 (First account) ----
await page.waitForSelector('text=First account', { timeout: 10000 })
const balance = page.locator('input[placeholder="e.g. 3.500.000"]')
await balance.fill('3500000')
const balVal = await balance.inputValue()
log('Balance typed:', balVal)
if (balVal !== '3.500.000') errors.push(`Balance format wrong: ${balVal}`)
await page.screenshot({ path: `${OUT}/04-step4.png`, fullPage: true })
await page.getByRole('button', { name: 'Finish setup' }).click()

// ---- Post-onboarding: app shell ----
await page.waitForSelector('text=Today', { timeout: 10000 })
await page.screenshot({ path: `${OUT}/05-home.png`, fullPage: true })

// ---- Navigate More > Income ----
await page.getByRole('button', { name: 'More', exact: true }).click()
await page.waitForSelector('text=Log income / raise', { timeout: 5000 })
await page.getByText('Log income / raise').first().click()
await page.waitForSelector('text=Income history', { timeout: 5000 })
await page.screenshot({ path: `${OUT}/06-income-sheet.png`, fullPage: true })

// ---- Add a raise event ----
await page.getByRole('button', { name: '+ Log raise' }).click()
await page.waitForSelector('input[type="date"]', { timeout: 5000 })
await page.locator('input[placeholder="15.000.000"]').fill('17000000')
await page.locator('input[placeholder="12.000.000"]').fill('14000000')
await page.locator('input[placeholder="e.g. Annual review 2026"]').fill('Smoke raise 2026')
await page.getByRole('button', { name: 'Save income event' }).click()
await page.waitForSelector('text=Smoke raise 2026', { timeout: 5000 })
await page.screenshot({ path: `${OUT}/07-income-after-add.png`, fullPage: true })

// ---- Reload: confirm onboarding doesn't reappear ----
await page.reload({ waitUntil: 'domcontentloaded' })
const stillOnboarded = await page.locator('text=Your take-home income').count()
log('Onboarding reappeared:', stillOnboarded)
if (stillOnboarded > 0) errors.push('Onboarding reappeared after reload — flag not persisted')

// ---- Long-press delete smoke (programmatic) ----
// We can't truly long-press via touch in playwright easily, so just confirm
// the card carries the title attr + interactive cursor.
await page.getByRole('button', { name: 'More', exact: true }).click()
await page.waitForSelector('text=Log income / raise', { timeout: 5000 })
await page.getByText('Log income / raise').first().click()
await page.waitForSelector('text=Income history', { timeout: 5000 })
const card = page.locator('[title="Long-press to delete"]').first()
const cardCount = await card.count()
log('Income card with long-press hint:', cardCount)
if (cardCount === 0) errors.push('No income card with long-press hint visible')

await page.screenshot({ path: `${OUT}/08-after-reload.png`, fullPage: true })

await browser.close()
console.log('\n[smoke] DONE')
console.log('[smoke] errors:', errors.length)
for (const e of errors) console.log('  -', e)
process.exit(errors.length ? 1 : 0)