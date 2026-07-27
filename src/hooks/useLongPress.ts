import { useRef } from 'react'

const HOLD_MS = 600

/**
 * Long-press gesture for list rows, shared by the Income and Recurring
 * registers so both delete the same way.
 *
 * Two details the inline versions got wrong:
 * - `onTouchMove` cancels. Without it, a finger resting on a row while the
 *   list scrolls reaches the hold threshold and fires a delete confirm;
 *   `touchcancel` alone is not dispatched reliably across engines.
 * - `consumedClick()` lets a row that is ALSO tappable (Recurring opens an
 *   edit sheet on tap) swallow the click that follows the press, which would
 *   otherwise open the sheet for the row the user just deleted.
 */
export function useLongPress<T>(onLongPress: (arg: T) => void, ms = HOLD_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  function cancel() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function handlers(arg: T) {
    const start = () => {
      fired.current = false
      cancel()
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        onLongPress(arg)
      }, ms)
    }
    return {
      onTouchStart: start,
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onTouchCancel: cancel,
      onMouseDown: start,
      onMouseUp: cancel,
      onMouseLeave: cancel,
    }
  }

  /** True when the press just fired — call it to suppress the trailing tap. */
  function consumedClick() {
    const f = fired.current
    fired.current = false
    return f
  }

  return { handlers, consumedClick }
}
