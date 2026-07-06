import { useState } from 'react'
import type { ChatSession } from '@db/types'
import { useChatStore } from '@stores/chatStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function SessionList({ open, onClose }: Props) {
  const { sessions, activeSessionId, createSession, switchSession, archiveSession, unarchiveSession, deleteSession, renameSession } = useChatStore()
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; y: number } | null>(null)

  if (!open) return null

  const active = sessions.filter((s) => !s.archived_at)
  const archived = sessions.filter((s) => s.archived_at)

  function handleNew() {
    createSession()
    onClose()
  }

  function handleSelect(id: string) {
    if (id === activeSessionId) { onClose(); return }
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

  function handleContextMenu(e: React.MouseEvent | React.TouchEvent, id: string) {
    e.preventDefault()
    const y = 'clientY' in e ? e.clientY : e.touches[0]?.clientY ?? 0
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

  function renderCard(s: ChatSession, isArchived = false) {
    const isActive = s.id === activeSessionId
    return (
      <div
        key={s.id}
        onClick={() => !isArchived && handleSelect(s.id)}
        onContextMenu={(e) => handleContextMenu(e, s.id)}
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: isActive ? 'var(--amber-bg)' : 'var(--bg-2)',
          border: `1px solid ${isActive ? 'var(--amber)' : 'var(--border-1)'}`,
          cursor: isArchived ? 'default' : 'pointer',
          opacity: isArchived ? 0.5 : 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {editingId === s.id ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-1)', border: '1px solid var(--amber)',
              borderRadius: 6, padding: '4px 8px', fontSize: 13,
              color: 'var(--ink-1)', outline: 'none', width: '100%',
            }}
          />
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.title || 'New chat'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--ink-3)' }}>
          <span style={{
            background: 'var(--bg-3)', borderRadius: 4, padding: '1px 6px',
            fontSize: 10, fontFamily: 'var(--font-mono)',
          }}>
            {s.model.split('-').slice(0, 2).join(' ')}
          </span>
          <span>{s.message_count} msgs</span>
          <span>{new Date(s.updated_at).toLocaleDateString()}</span>
        </div>
        {isArchived && (
          <button
            onClick={(e) => { e.stopPropagation(); unarchiveSession(s.id) }}
            style={{
              alignSelf: 'flex-start', marginTop: 4, padding: '4px 10px',
              fontSize: 11, borderRadius: 6, border: '1px solid var(--border-2)',
              background: 'var(--bg-1)', color: 'var(--ink-2)', cursor: 'pointer',
            }}
          >
            Unarchive
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Slide-in panel */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: '85%', maxWidth: 340,
          zIndex: 201, background: 'var(--bg-1)', display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border-2)',
          animation: 'slideInLeft .2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 14px 10px' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-1)' }}>Sessions</span>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-3)', border: 'none', borderRadius: '50%',
              width: 28, height: 28, cursor: 'pointer', color: 'var(--ink-2)',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* New chat button */}
        <button
          onClick={handleNew}
          style={{
            margin: '0 14px 12px', padding: '10px', borderRadius: 10,
            background: 'var(--amber)', border: 'none', color: '#000',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + New Chat
        </button>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.map((s) => renderCard(s))}

          {archived.length > 0 && (
            <>
              <button
                onClick={() => setShowArchived(!showArchived)}
                style={{
                  background: 'none', border: 'none', color: 'var(--ink-3)',
                  fontSize: 11, cursor: 'pointer', padding: '8px 0',
                  textTransform: 'uppercase', letterSpacing: '.5px',
                }}
              >
                {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
              </button>
              {showArchived && archived.map((s) => renderCard(s, true))}
            </>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div onClick={() => setContextMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
          <div style={{
            position: 'fixed', left: 60, top: contextMenu.y, zIndex: 301,
            background: 'var(--bg-2)', border: '1px solid var(--border-2)',
            borderRadius: 10, padding: '4px 0', minWidth: 140,
            boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          }}>
            {[
              { label: 'Rename', action: () => { const s = sessions.find((s) => s.id === contextMenu.id); if (s) startRename(s) } },
              { label: 'Archive', action: () => handleArchive(contextMenu.id) },
              { label: 'Delete', action: () => handleDelete(contextMenu.id) },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px',
                  background: 'none', border: 'none', textAlign: 'left',
                  fontSize: 13, color: item.label === 'Delete' ? '#ef4444' : 'var(--ink-1)',
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
