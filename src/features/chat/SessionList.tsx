import { Btn } from '@components/FormField'
import { Row, SectionHeader } from '@components/ui'
import type { ChatSession } from '@db/types'
import { useChatStore } from '@stores/chatStore'
import { useState } from 'react'
import { getModelLabel } from '../../ai/models'

interface Props {
  open: boolean
  onClose: () => void
}

export function SessionList({ open, onClose }: Props) {
  const {
    sessions,
    activeSessionId,
    createSession,
    switchSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
    renameSession,
  } = useChatStore()
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    id: string
    y: number
  } | null>(null)

  if (!open) return null

  const active = sessions.filter((s) => !s.archived_at)
  const archived = sessions.filter((s) => s.archived_at)

  function handleNew() {
    createSession()
    onClose()
  }

  function handleSelect(id: string) {
    if (id === activeSessionId) {
      onClose()
      return
    }
    switchSession(id)
    onClose()
  }

  function startRename(s: ChatSession) {
    setEditingId(s.id)
    setEditTitle(s.title || '')
    setContextMenu(null)
  }

  function commitRename() {
    if (editingId && editTitle.trim()) {
      renameSession(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  function handleContextMenu(
    e: React.MouseEvent | React.TouchEvent,
    id: string,
  ) {
    e.preventDefault()
    const y = 'clientY' in e ? e.clientY : (e.touches[0]?.clientY ?? 0)
    setContextMenu({ id, y })
  }

  function handleArchive(id: string) {
    archiveSession(id)
    setContextMenu(null)
  }

  function handleDelete(id: string) {
    if (window.confirm('Permanently delete this conversation?')) {
      deleteSession(id)
    }
    setContextMenu(null)
  }

  // Session rows (B5 migration): a flush <Row> per session — "rows, not
  // boxes" (Calm Ledger v2 §3) — instead of the old bordered/boxed card per
  // session. The active session is signalled by an amber-tinted row
  // background (matching the isActive-highlight idiom used elsewhere, e.g.
  // SpendingLens.tsx/ReconcileConfirmScreen.tsx) rather than a border box.
  function renderRow(s: ChatSession, isArchived = false) {
    const isActive = s.id === activeSessionId

    if (editingId === s.id) {
      return (
        <div key={s.id} style={{ padding: 'var(--space-2) var(--space-4)' }}>
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditingId(null)
            }}
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--amber)',
              borderRadius: 6,
              padding: 'var(--space-1) var(--space-2)',
              fontSize: 'var(--text-body)',
              color: 'var(--ink-1)',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
      )
    }

    return (
      // Row's Props type doesn't include onContextMenu (it's a closed
      // interface, not an HTMLAttributes passthrough) — a plain wrapping div
      // carries the (secondary) long-press/right-click affordance instead of
      // widening Row's public API for one caller.
      <div key={s.id} onContextMenu={(e) => handleContextMenu(e, s.id)}>
        <Row
          {...(isArchived ? {} : { onClick: () => handleSelect(s.id) })}
          primary={s.title || 'New chat'}
          caption={
            <span
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'center',
              }}
            >
              <span>{getModelLabel(s.model, 'short')}</span>
              <span>{s.message_count} msgs</span>
              <span>{new Date(s.updated_at).toLocaleDateString()}</span>
              {isArchived && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    unarchiveSession(s.id)
                  }}
                  style={{
                    padding: 'var(--space-1) var(--space-2)',
                    fontSize: 'var(--text-caption)',
                    borderRadius: 6,
                    border: '1px solid var(--border-2)',
                    background: 'var(--bg-1)',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                >
                  Unarchive
                </button>
              )}
            </span>
          }
          style={{
            opacity: isArchived ? 0.5 : 1,
            background: isActive ? 'var(--amber-surface)' : undefined,
          }}
        />
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.5)',
          zIndex: 200,
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Slide-in panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '85%',
          maxWidth: 340,
          zIndex: 201,
          background: 'var(--bg-1)',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-2)',
          animation: 'slideInLeft .2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-4) var(--space-3)',
          }}
        >
          <SectionHeader>Sessions</SectionHeader>
          <button
            onClick={onClose}
            aria-label="Close sessions"
            style={{
              background: 'var(--bg-3)',
              border: 'none',
              borderRadius: '50%',
              width: 28,
              height: 28,
              cursor: 'pointer',
              color: 'var(--ink-2)',
              fontSize: 'var(--text-body)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* New chat button */}
        <div style={{ margin: '0 var(--space-4) var(--space-3)' }}>
          <Btn onClick={handleNew} fullWidth>
            + New Chat
          </Btn>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {active.map((s) => renderRow(s))}

          {archived.length > 0 && (
            <>
              <button
                onClick={() => setShowArchived(!showArchived)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-3)',
                  fontSize: 'var(--text-caption)',
                  cursor: 'pointer',
                  padding: 'var(--space-2) var(--space-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.5px',
                }}
              >
                {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
              </button>
              {showArchived && archived.map((s) => renderRow(s, true))}
            </>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            onClick={() => setContextMenu(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 300 }}
          />
          <div
            style={{
              position: 'fixed',
              left: 60,
              top: contextMenu.y,
              zIndex: 301,
              background: 'var(--bg-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 10,
              padding: 'var(--space-1) 0',
              minWidth: 140,
              boxShadow: '0 4px 12px rgba(0,0,0,.3)',
            }}
          >
            {[
              {
                label: 'Rename',
                action: () => {
                  const s = sessions.find((s) => s.id === contextMenu.id)
                  if (s) startRename(s)
                },
              },
              { label: 'Archive', action: () => handleArchive(contextMenu.id) },
              { label: 'Delete', action: () => handleDelete(contextMenu.id) },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: 'var(--text-body)',
                  color: item.label === 'Delete' ? '#ef4444' : 'var(--ink-1)',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
