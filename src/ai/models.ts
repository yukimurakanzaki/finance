// Available AI models for the chat feature. The edge function routes to the
// correct backend based on the model id. Keys are never exposed to the client;
// only ids are sent in the request body.

export interface ModelConfig {
  id: string
  /** Human label for end users (M2, PAIN-POINTS.md) — the raw `id` is the
   *  stored value and the string sent to the backend, never shown directly. */
  name: string
  /** Short label for cramped UI (header pill, session list badge) — still
   *  human-readable, just shorter than `name`. Falls back to `name` if unset. */
  shortName?: string
  provider: 'google' | 'anthropic'
  contextWindow: number
  maxOutput: number
  costTier: 'free' | 'standard' | 'premium'
}

// Single source of truth for the models the app/backend supports (M2,
// PAIN-POINTS.md: "the picker exposes raw model-ID strings to an end user").
// Anything that needs a model's display name reads it from here via
// `getModelConfig`/`getModelLabel` — never by reformatting the id string.
export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet',
    shortName: 'Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 16_384,
    costTier: 'premium',
  },
]

// M2 fix: ChatScreen.tsx previously hardcoded the literal id string
// `claude-sonnet-4-20250514` as its own fallback default, duplicating (and
// risking drifting from) this list. It now imports DEFAULT_MODEL instead, so
// there is exactly one place that decides the current default — and it's
// guaranteed to be a ModelConfig that's actually in AVAILABLE_MODELS (see the
// dev-time assertion below), not an invented or stale id.
export const DEFAULT_MODEL = AVAILABLE_MODELS[0]!.id

export function getModelConfig(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id)
}

// Human label for a model id, for any UI that only has the id on hand (e.g. a
// session record). Falls back to the raw id only for an id the app no longer
// recognizes (a session created under a retired model) — better a stale-but-
// legible string than a blank label.
export function getModelLabel(
  id: string,
  variant: 'full' | 'short' = 'full',
): string {
  const cfg = getModelConfig(id)
  if (!cfg) return id
  return variant === 'short' ? (cfg.shortName ?? cfg.name) : cfg.name
}

if (import.meta.env.DEV && !getModelConfig(DEFAULT_MODEL)) {
  // Should be unreachable (DEFAULT_MODEL is derived from the list above), but
  // guards against a future edit accidentally decoupling the two again.
  console.error(`DEFAULT_MODEL "${DEFAULT_MODEL}" is not in AVAILABLE_MODELS.`)
}

// Model IDs the proxy will accept — anything else gets a 400.
export const ALLOWED_MODEL_IDS = new Set(AVAILABLE_MODELS.map((m) => m.id))
