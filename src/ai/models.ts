// Available AI models for the chat feature. The edge function routes to the
// correct backend based on the model id. Keys are never exposed to the client;
// only ids are sent in the request body.

export interface ModelConfig {
  id: string
  name: string
  provider: 'google' | 'anthropic'
  contextWindow: number
  maxOutput: number
  costTier: 'free' | 'standard' | 'premium'
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 16_384,
    costTier: 'premium',
  },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

export function getModelConfig(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id)
}

// Model IDs the proxy will accept — anything else gets a 400.
export const ALLOWED_MODEL_IDS = new Set(AVAILABLE_MODELS.map((m) => m.id))
