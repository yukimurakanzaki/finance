import { useState, useEffect } from 'react'
import { db } from '@db/db'
import type { Account, Category } from '@db/types'
import { Btn } from '@components/FormField'

const LANE_LABELS: Record<string, string> = {
  income_producing: 'income_producing — money that earns (salary, dividends)',
  store_of_value: 'store_of_value — savings & investments',
  debt_liability: 'debt_liability — loans & credit cards',
  protected_living: 'protected_living — day-to-day spending',
}

function buildPrompt(accounts: Account[], categories: Category[]): string {
  const accountLines = accounts
    .map((a) => `  • id "${a.id}" → ${a.name} (${a.institution}, ${a.account_type})`)
    .join('\n')

  const categoryLines =
    categories.length > 0
      ? categories.map((c) => `  • "${c.name}" [${c.lane}]`).join('\n')
      : '  (no categories set up yet — use empty string "" for category)'

  return `Please convert the transactions below into a JSON array for my finance app.

=== REQUIRED FORMAT ===
[
  {
    "date": "YYYY-MM-DD",
    "amount": 250000,
    "direction": "out",
    "account_id": "1",
    "category": "Groceries",
    "suggested_lane": "protected_living",
    "note": "Indomaret weekly shop"
  }
]

=== FIELD RULES ===
• date        – ISO format YYYY-MM-DD (e.g. ${new Date().toISOString().slice(0, 10)})
• amount      – positive number, no symbols or commas (e.g. 250000 not "Rp 250.000")
• direction   – "in" = money received, "out" = money spent/transferred out
• account_id  – string ID from my account list below (must match exactly)
• category    – category name from my list below, or "" if unknown
• suggested_lane – one of:
${Object.values(LANE_LABELS).map((l) => `    • "${l.split(' ')[0]}"`).join('\n')}
    Details:
${Object.values(LANE_LABELS).map((l) => `      ${l}`).join('\n')}
• note        – optional short description (can be "")

=== MY ACCOUNTS ===
${accountLines}

=== MY CATEGORIES ===
${categoryLines}

=== OUTPUT RULES ===
• Return ONLY the raw JSON array — no markdown, no code fences, no explanation
• Every field must be present (use "" for empty note/category)
• Keep one transaction per array item
• If direction is ambiguous, use "out" for purchases and "in" for top-ups/salaries

=== TRANSACTIONS TO CONVERT ===
[paste your transactions here — bank statement rows, screenshots text, etc.]`
}

export function ImportPromptSheet() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all([
      db.accounts.filter((a) => a.is_active).toArray(),
      db.categories.toArray(),
    ]).then(([accs, cats]) => {
      setAccounts(accs)
      setCategories(cats)
    })
  }, [])

  const prompt = buildPrompt(accounts, categories)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select the textarea
      const el = document.getElementById('import-prompt-text') as HTMLTextAreaElement | null
      el?.select()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ fontSize: 'var(--text-section)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
        Copy this prompt, paste it into Claude, then add your bank transactions at the bottom.
        Claude will reply with a JSON array you can import here.
      </div>

      <textarea
        id="import-prompt-text"
        readOnly
        value={prompt}
        style={{
          flex: 1,
          minHeight: 260,
          background: 'var(--bg-2)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--space-2)',
          paddingBlock: 'var(--space-3)',
          paddingInline: 'var(--space-3)',
          fontSize: 'var(--text-caption)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-1)',
          lineHeight: 1.6,
          resize: 'none',
          outline: 'none',
        }}
        onFocus={(e) => e.target.select()}
      />

      {accounts.length === 0 && (
        <div style={{ fontSize: 'var(--text-caption)', color: '#f59e0b', lineHeight: 1.5 }}>
          No active accounts found. Add accounts first so the prompt includes your real account IDs.
        </div>
      )}

      <Btn onClick={handleCopy} fullWidth>
        {copied ? 'Copied!' : 'Copy prompt to clipboard'}
      </Btn>
    </div>
  )
}
