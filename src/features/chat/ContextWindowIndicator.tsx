import { useChatStore } from '@stores/chatStore'

export function ContextWindowIndicator() {
  const { sessionInputTokens, sessionOutputTokens, activeSessionId } = useChatStore()

  if (!activeSessionId) return null

  const total = sessionInputTokens + sessionOutputTokens
  // Use a safe estimate — Claude Sonnet is 200K, Gemini models are 1M
  // Use the lower bound to be conservative
  const limit = 200_000
  const pct = Math.min(100, Math.round((total / limit) * 100))

  let color = '#22c55e' // green
  if (pct > 50) color = '#f59e0b' // amber
  if (pct > 80) color = '#ef4444' // red

  return (
    <div
      title={`${total.toLocaleString()} / ${limit.toLocaleString()} tokens (${pct}%)`}
      style={{
        height: 3, width: '100%', borderRadius: 2, background: `${color}30`,
        overflow: 'hidden', marginTop: -1,
      }}
    >
      <div style={{
        width: `${pct}%`, height: '100%', background: color, borderRadius: 2,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}
