import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  height?: string
}

export function BottomSheet({ open, onClose, title, children, height = '70dvh' }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
          zIndex: 100, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
          background: 'var(--bg-1)', borderRadius: '18px 18px 0 0',
          border: '1px solid var(--border-2)', borderBottom: 'none',
          maxHeight: height, display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }} />
        </div>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px 12px',
          borderBottom: '1px solid var(--border-1)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-1)' }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'var(--bg-3)', border: 'none', borderRadius: '50%',
              width: 28, height: 28, cursor: 'pointer', color: 'var(--ink-2)',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
          {children}
        </div>
      </div>
    </>
  )
}
