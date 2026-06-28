// Device-local YYYY-MM-DD — never UTC (wrong for WIB UTC+7 after 17:00 UTC)
export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

// Monday of the ISO week containing `date` (Monday = (getDay() + 6) % 7 === 0)
export function isoWeekStart(date: Date): string {
  const d = new Date(date)
  const dayOfWeek = (d.getDay() + 6) % 7 // 0=Mon … 6=Sun
  d.setDate(d.getDate() - dayOfWeek)
  return localISO(d)
}

// Friday of the ISO week containing `date`
export function isoWeekEnd(date: Date): string {
  const start = new Date(date)
  const dayOfWeek = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dayOfWeek + 4)
  return localISO(start)
}

// Mon–Fri count from today (inclusive) through Friday of this ISO week. Min 1 on Friday.
// Returns 0 only on weekend (caller shows weekend state).
export function workdaysRemaining(today: Date): number {
  const dow = (today.getDay() + 6) % 7 // 0=Mon … 6=Sun
  if (dow >= 5) return 0 // Sat or Sun
  return 5 - dow // Mon=5, Tue=4, Wed=3, Thu=2, Fri=1
}

// Approximate workweeks in a month: floor(workdays ÷ 5)
export function weeksInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  let workdays = 0
  const cur = new Date(first)
  while (cur <= last) {
    const dow = (cur.getDay() + 6) % 7
    if (dow < 5) workdays++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(1, Math.floor(workdays / 5))
}

export function advanceByOneMonth(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const next = new Date(y, m, d) // month is 0-indexed: m (not m-1) = next month
  return localISO(next)
}

export function dayLabelsForWeek(today: Date): Array<{
  iso: string
  label: string
  state: 'spent' | 'today' | 'future'
}> {
  const dow = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(monday.getDate() - dow)
  const todayISO_ = localISO(today)

  return ['M', 'T', 'W', 'T', 'F'].map((label, i) => {
    const d = addDays(monday, i)
    const iso = localISO(d)
    return {
      iso,
      label,
      state: iso < todayISO_ ? 'spent' : iso === todayISO_ ? 'today' : 'future',
    }
  })
}
