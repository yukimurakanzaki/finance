import { Btn, Field, Input } from '@components/FormField'
import {
  PinSaltMissingError,
  clearPin,
  hasPin,
  setPin,
  verifyPin,
} from '@lib/crypto'
import { useState } from 'react'

type Mode =
  | 'menu'
  | 'set-new'
  | 'change-verify'
  | 'change-new'
  | 'remove-verify'

interface Props {
  onDone: () => void
}

export function PinSetup({ onDone }: Props) {
  const [mode, setMode] = useState<Mode>(hasPin() ? 'menu' : 'set-new')
  const [pin, setPin_] = useState('')
  const [confirm, setConfirm] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setPin_('')
    setConfirm('')
    setOldPin('')
    setError(null)
  }

  async function handleSetNew() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }
    if (pin !== confirm) {
      setError('PINs do not match')
      return
    }
    setBusy(true)
    await setPin(pin)
    setBusy(false)
    reset()
    onDone()
  }

  async function handleVerifyOld(nextMode: 'change-new' | 'remove-verify') {
    if (!oldPin) return
    setBusy(true)
    try {
      const ok = await verifyPin(oldPin)
      if (!ok) {
        setError('Incorrect PIN')
        setBusy(false)
        return
      }
    } catch (e) {
      if (e instanceof PinSaltMissingError) {
        clearPin()
        setMode('set-new')
        setBusy(false)
        return
      }
      throw e
    }
    setBusy(false)
    setOldPin('')
    setError(null)
    if (nextMode === 'remove-verify') {
      clearPin()
      onDone()
    } else {
      setMode('change-new')
    }
  }

  if (mode === 'menu') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Btn
          onClick={() => {
            reset()
            setMode('change-verify')
          }}
          fullWidth
        >
          Change PIN
        </Btn>
        <Btn
          variant="danger"
          onClick={() => {
            reset()
            setMode('remove-verify')
          }}
          fullWidth
        >
          Remove PIN
        </Btn>
        <Btn variant="secondary" onClick={onDone} fullWidth>
          Cancel
        </Btn>
      </div>
    )
  }

  if (mode === 'set-new') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 'var(--text-section)', color: 'var(--ink-2)' }}>
          Set a PIN to lock the app when you switch away.
        </div>
        <Field label="New PIN (4+ digits)" {...(error ? { error } : {})}>
          <Input
            type="password"
            inputMode="numeric"
            mono
            value={pin}
            onChange={(e) => {
              setPin_(e.target.value)
              setError(null)
            }}
            placeholder="····"
            maxLength={8}
          />
        </Field>
        <Field label="Confirm PIN">
          <Input
            type="password"
            inputMode="numeric"
            mono
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError(null)
            }}
            placeholder="····"
            maxLength={8}
          />
        </Field>
        <Btn
          onClick={handleSetNew}
          disabled={busy || !pin || !confirm}
          fullWidth
        >
          {busy ? 'Saving…' : 'Set PIN'}
        </Btn>
        {hasPin() && (
          <Btn variant="secondary" onClick={onDone} fullWidth>
            Cancel
          </Btn>
        )}
      </div>
    )
  }

  if (mode === 'change-verify' || mode === 'remove-verify') {
    const label =
      mode === 'change-verify'
        ? 'Enter current PIN to change it'
        : 'Enter current PIN to remove it'
    const action =
      mode === 'change-verify'
        ? () => handleVerifyOld('change-new')
        : () => handleVerifyOld('remove-verify')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={label} {...(error ? { error } : {})}>
          <Input
            type="password"
            inputMode="numeric"
            mono
            autoFocus
            value={oldPin}
            onChange={(e) => {
              setOldPin(e.target.value)
              setError(null)
            }}
            placeholder="····"
            maxLength={8}
          />
        </Field>
        <Btn onClick={action} disabled={busy || !oldPin} fullWidth>
          {busy ? 'Verifying…' : 'Continue'}
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            reset()
            setMode('menu')
          }}
          fullWidth
        >
          Back
        </Btn>
      </div>
    )
  }

  // change-new
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="New PIN (4+ digits)" {...(error ? { error } : {})}>
        <Input
          type="password"
          inputMode="numeric"
          mono
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin_(e.target.value)
            setError(null)
          }}
          placeholder="····"
          maxLength={8}
        />
      </Field>
      <Field label="Confirm new PIN">
        <Input
          type="password"
          inputMode="numeric"
          mono
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
          placeholder="····"
          maxLength={8}
        />
      </Field>
      <Btn onClick={handleSetNew} disabled={busy || !pin || !confirm} fullWidth>
        {busy ? 'Saving…' : 'Save new PIN'}
      </Btn>
      <Btn
        variant="secondary"
        onClick={() => {
          reset()
          setMode('menu')
        }}
        fullWidth
      >
        Back
      </Btn>
    </div>
  )
}
