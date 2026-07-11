import { useState } from 'react'
import { verifyPin, hasPin, PinSaltMissingError, clearPin } from '@lib/crypto'
import { usePinStore } from '@stores/pinStore'

export function PinLockScreen() {
  const { unlock, recordFailedAttempt, resetAttempts, attemptCount, lockoutUntil } = usePinStore()
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(!hasPin())

  const isLockedOut = lockoutUntil !== null && Date.now() < lockoutUntil

  async function handleSubmit() {
    if (digits.length < 4) return
    try {
      const ok = await verifyPin(digits)
      if (ok) {
        resetAttempts()
        unlock()
      } else {
        recordFailedAttempt()
        setError('Incorrect PIN')
        setDigits('')
      }
    } catch (e) {
      if (e instanceof PinSaltMissingError) {
        clearPin()
        setNeedsSetup(true)
        setError(null)
      }
    }
  }

  function handleDigit(d: string) {
    const next = digits + d
    setDigits(next)
    setError(null)
    if (next.length === 4) {
      setTimeout(() => {
        verifyPin(next).then((ok) => {
          if (ok) { resetAttempts(); unlock() }
          else { recordFailedAttempt(); setError('Incorrect PIN'); setDigits('') }
        }).catch((e) => {
          if (e instanceof PinSaltMissingError) { clearPin(); setNeedsSetup(true) }
        })
      }, 80)
    }
  }

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)', gap: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.5px' }}>
          FI Dashboard
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6 }}>
          {needsSetup ? 'Set up your PIN' : 'Enter PIN to unlock'}
        </div>
      </div>

      {isLockedOut && (
        <div style={{ color: 'var(--amber-text)', fontSize: 13 }}>
          Too many attempts. Wait 5 minutes.
        </div>
      )}

      {/* Dot indicators */}
      <div style={{ display: 'flex', gap: 14 }}>
        {[0,1,2,3].map((i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: i < digits.length ? 'var(--amber)' : 'var(--bg-3)',
            border: '1px solid var(--border-2)',
            transition: 'background .1s',
          }} />
        ))}
      </div>

      {error && <div role="alert" style={{ color: 'var(--amber-text)', fontSize: 13 }}>{error}</div>}

      {/* Numpad */}
      {!isLockedOut && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 12 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button
              key={i}
              onClick={() => {
                if (d === '⌫') setDigits(prev => prev.slice(0,-1))
                else if (d !== '') handleDigit(d)
              }}
              disabled={d === ''}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: d === '' ? 'transparent' : 'var(--bg-2)',
                border: d === '' ? 'none' : '1px solid var(--border-2)',
                color: 'var(--ink-1)', fontSize: 22, fontWeight: 500,
                cursor: d === '' ? 'default' : 'pointer',
                fontFamily: 'var(--font-ui)',
                transition: 'background .1s',
              }}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {attemptCount > 0 && `${attemptCount}/5 attempts`}
      </div>
    </div>
  )
}
