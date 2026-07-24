// Available AI models for the chat feature. The edge function routes to the
// correct backend based on the model id. Keys are never exposed to the client;
// only ids are sent in the request body.

export interface ModelConfig {
  id: string
  name: string
  provider: 'google' | 'anthropic' | 'minimax'
  contextWindow: number
  maxOutput: number
  costTier: 'free' | 'standard' | 'premium'
}

// Ponytail: client model id MUST match the deployed proxy's allowlist. The
// proxy now routes `minimax-m3` to MiniMax's Anthropic-compatible /v1/messages
// endpoint (Bearer auth, no version header). Swap DEFAULT_MODEL when proxy
// allowlist changes.
export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'minimax-m3',
    name: 'Minimax M3',
    provider: 'minimax',
    contextWindow: 200_000,
    maxOutput: 8_000,
    costTier: 'standard',
  },
]

export const DEFAULT_MODEL = 'minimax-m3'

export function getModelConfig(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id)
}

// Model IDs the proxy will accept — anything else gets a 400.
export const ALLOWED_MODEL_IDS = new Set(AVAILABLE_MODELS.map((m) => m.id))
