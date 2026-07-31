import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input } from '@components/FormField'
import { Amount, Row, SectionHeader } from '@components/ui'
import { correctionsRepo } from '@db/repositories/corrections.repo'
import type { Account } from '@db/types'
import type { CorrectionPlan } from '@engine/balanceCorrection'
import { formatRpFull, formatRpInput, parseRpBalance } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  account: Account
}

// D1 — "Set true balance". The user is standing at a cashier comparing a wallet
// to a screen; this is the fastest path from "that's wrong" to "that's right".
//
// Deliberately absent: any question about what the difference was spent on.
// The user is here precisely because they don't remember — asking is the bug.
// The correction is booked uncategorised and can be given a category later.
export function BalanceCorrectionSheet({ open, onClose, account }: Props) {
  const [raw, setRaw] = useState('')
  const [asOfDate, setAsOfDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const accountId = account.id as string
  const actualBalance = parseRpBalance(raw)

  // Both the preview below and the write itself go through correctionsRepo, so
  // the figure the user approves is the figure that gets booked.
  const plan = useLiveQuery(
    async (): Promise<CorrectionPlan | null> =>
      actualBalance === null
        ? null
        : correctionsRepo.preview({ accountId, actualBalance, asOfDate }),
    [accountId, actualBalance, asOfDate],
  )

  const history = useLiveQuery(() => correctionsRepo.byAccount(accountId), [accountId]) ?? []

  async function handleSave() {
    if (actualBalance === null || !plan?.ok) return
    setSaving(true)
    await correctionsRepo.correctBalance({
      accountId,
      actualBalance,
      asOfDate,
      note: note.trim() || null,
    })
    setSaving(false)
    setRaw('')
    setNote('')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Set true balance" height="88dvh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          {account.name}
        </div>

        <DuplicateWarning accountId={accountId} />

        <DerivedRow accountId={accountId} asOfDate={asOfDate} />

        <Field label="Actual balance (Rp)">
          <Input
            type="text"
            inputMode="numeric"
            mono
            autoFocus
            value={raw}
            onChange={(e) => setRaw(formatRpInput(e.target.value))}
            placeholder="412.000"
          />
        </Field>

        {plan && <PlanFeedback plan={plan} asOfDate={asOfDate} />}

        <Field label="As of">
          <Input
            type="date"
            mono
            value={asOfDate}
            max={todayISO()}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </Field>

        <Field label="Note (optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='e.g. "cash I forgot to log"'
            maxLength={200}
          />
        </Field>

        <Btn onClick={handleSave} disabled={saving || !plan?.ok} fullWidth>
          {saving ? 'Saving…' : 'Set balance'}
        </Btn>

        {history.length > 0 && (
          <div>
            <SectionHeader>Correction history</SectionHeader>
            {history.map((h, i) => (
              <Row
                key={h.id}
                primary={formatRpFull(h.new_balance)}
                caption={`was ${formatRpFull(h.previous_balance)} · ${h.as_of_date}${
                  h.reverts_id ? ' · undo' : ''
                }`}
                right={
                  // Only the newest row is undoable: reverting an older one
                  // would silently re-apply every correction stacked on top.
                  i === 0 && !h.reverts_id ? (
                    <button
                      type="button"
                      onClick={() => correctionsRepo.revert(h.id as string)}
                      style={undoStyle}
                    >
                      Undo
                    </button>
                  ) : (
                    <Amount value={h.new_balance - h.previous_balance} sign="always" />
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

// Edge case 7 — two devices corrected this account offline and both
// adjustments applied, so the balance is off by the whole duplicate. The app
// can't know which one the user meant, so it says what happened and offers to
// undo one. Never auto-merges.
function DuplicateWarning({ accountId }: { accountId: string }) {
  const groups =
    useLiveQuery(() => correctionsRepo.duplicatesFor(accountId), [accountId]) ?? []
  const group = groups[0]
  if (!group) return null

  const extra = group.ids.length - 1
  return (
    <div style={duplicateStyle} role="alert">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {group.ids.length} corrections for {group.as_of_date}
      </div>
      <div>
        Each one started from {formatRpFull(group.previous_balance)}, so they were
        made without seeing each other — probably the same correction from two
        devices. This balance is currently off by {extra} of them.
      </div>
      <button
        type="button"
        onClick={() => correctionsRepo.revert(group.ids[group.ids.length - 1] as string)}
        style={undoStyle}
      >
        Undo the newest one
      </button>
    </div>
  )
}

// What the app thinks the account held on the chosen date — the number the
// user is disagreeing with.
function DerivedRow({ accountId, asOfDate }: { accountId: string; asOfDate: string }) {
  const derived = useLiveQuery(
    () => correctionsRepo.derivedAsOf(accountId, asOfDate),
    [accountId, asOfDate],
  )

  return (
    <Row
      primary="App shows"
      right={derived === undefined ? '—' : <Amount value={derived} />}
    />
  )
}

function PlanFeedback({ plan, asOfDate }: { plan: CorrectionPlan; asOfDate: string }) {
  if (plan.ok) {
    const gained = plan.direction === 'in'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Difference</span>
          <Amount value={plan.delta} sign="always" />
        </div>
        <div style={captionStyle}>
          Logged as a correction. Not counted as {gained ? 'income' : 'spending'}.
        </div>
        {/* A backdated correction doesn't leave the account on the figure just
            typed — everything logged since still applies on top. Say where it
            actually lands, or the user is surprised twice. */}
        {asOfDate !== todayISO() && (
          <div style={captionStyle}>
            After the transactions logged since then, this account will show{' '}
            {formatRpFull(plan.resultingBalance)}.
          </div>
        )}
      </div>
    )
  }

  if (plan.reason === 'before_anchor') {
    return (
      <div style={errorStyle}>
        Pick a date after {plan.anchorDate} — that's when this account's starting
        balance was set.
      </div>
    )
  }
  if (plan.reason === 'future_date') {
    return <div style={errorStyle}>Pick today or an earlier date.</div>
  }
  return <div style={captionStyle}>That already matches — nothing to correct.</div>
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--ink-3)',
}

const captionStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  lineHeight: 'var(--leading-caption)',
  color: 'var(--ink-3)',
}

const errorStyle: React.CSSProperties = {
  ...captionStyle,
  color: 'var(--amber-text)',
}

const duplicateStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  lineHeight: 'var(--leading-caption)',
  color: 'var(--ink-2)',
  background: 'var(--bg-2)',
  border: '1px solid var(--amber)',
  borderRadius: 'var(--space-2)',
  padding: 'var(--space-3)',
}

const undoStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  // Padded rather than flush: this is a destructive-ish control on a list row
  // and needs a thumb-sized target, not a text-sized one.
  padding: 'var(--space-2) var(--space-3)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  color: 'var(--amber-text)',
  cursor: 'pointer',
}
