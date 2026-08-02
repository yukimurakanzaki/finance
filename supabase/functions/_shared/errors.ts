// Shared error helpers for the anthropic-proxy edge function.
//
// Kept tiny and dependency-free so it can be tested with vitest (no Deno needed
// in the test runner). The proxy imports from here; tests import the same way.

// HTTP status from an upstream provider (Anthropic / Gemini / MiniMax). Thrown
// by provider-specific call functions so the handler can decide whether to
// forward (permanent user-input errors), retry (transient infra), or fold into
// 502 (config/transport failures that look like user errors but aren't).
export class UpstreamError extends Error {
  readonly upstreamStatus: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "UpstreamError"
    this.upstreamStatus = status
  }
}

// Statuses we forward as-is to the client. Anything else in 4xx (408, 409, 429)
// gets folded into 502 so the client can retry — these are rate-limit /
// timeout / conflict codes where the caller's input didn't change but the
// server state did.
export const PERMANENT_USER_INPUT_STATUSES = new Set([400, 413, 422, 451])

// Strip secrets and URL query strings from an error message before it reaches
// the client. fetch() rejections embed the request URL — which previously leaked
// the Google API key in a query param. Provider validation messages also
// legitimately contain "?" in prose ("Did you mean X? Try..."), so we only strip
// within a URL-shaped prefix, not any bare "?".
export function sanitizeError(msg: string): string {
  return msg
    // Strip query strings only inside http(s) URLs. Bare "?" in prose is safe.
    .replace(/https?:\/\/[^\s)]*\?[^\s)]*/g, (m) => m.replace(/\?.*$/, "?<redacted>"))
    // Label-anchored: "bearer <token>", "key=<token>", "authorization: <token>"
    .replace(/(bearer|key|token|authorization)(?:\s*[:=]\s*|\s+)[\w\-./+=]{8,}/gi, "$1=<redacted>")
    // Literal-shape secrets with no label. Anthropic sk-ant-, OpenAI sk-,
    // Google AIza — anchored by their distinctive prefixes.
    .replace(/\bsk-(?:ant-)?api\d{2}-[\w-]{16,}/g, "sk-<redacted>")
    .replace(/\bAIza[\w-]{30,}\b/g, "AIza<reducted>")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "sk-<redacted>")
    // Truncate to a sane length; raw provider stack traces can be huge.
    .slice(0, 400)
}

// Build the response body + status for a given caught error in the proxy handler.
export function classifyProxyError(err: unknown): { body: any; httpStatus: number } {
  const isUpstream = err instanceof UpstreamError
  const upstreamStatus = isUpstream ? err.upstreamStatus : 0
  const msg = sanitizeError(err instanceof Error ? err.message : String(err))
  if (isUpstream && PERMANENT_USER_INPUT_STATUSES.has(upstreamStatus)) {
    return {
      httpStatus: upstreamStatus,
      body: { error: { type: "upstream_4xx", upstream_status: upstreamStatus, message: msg } },
    }
  }
  // 4xx retryable (408/409/429), all 5xx, transport, parse, missing secrets.
  return {
    httpStatus: 502,
    body: { error: { type: "transient", upstream_status: upstreamStatus, message: msg } },
  }
}