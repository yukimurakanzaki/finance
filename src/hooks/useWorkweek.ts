import { useMemo } from 'react'
import { todayISO, isoWeekStart, isoWeekEnd, workdaysRemaining, dayLabelsForWeek } from '@lib/dates'

export function useWorkweek() {
  return useMemo(() => {
    const today = new Date()
    return {
      weekStart: isoWeekStart(today),
      weekEnd: isoWeekEnd(today),
      today: todayISO(),
      remaining: workdaysRemaining(today),
      dayLabels: dayLabelsForWeek(today),
    }
  }, [])
}
