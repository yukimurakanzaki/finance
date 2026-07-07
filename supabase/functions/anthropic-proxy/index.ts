// Proxies chat requests to the Anthropic Messages API using a server-held key.
// Hardening (Phase A, audit D1 + E3):
//  - model is pinned server-side; max_tokens clamped; request body size capped.
//  - per-user daily token budget enforced against the ai_usage ledger.
//  - every turn logged to ai_usage with prompt_version for regression tracing.
// Auth is enforced by Supabase (verify_jwt); the system prompt and messages stay
// client-built because the household's data context lives on the client (until Phase B).
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
const ANTHROPIC_VERSION = "2023-06-01"

const ALLOWED_MODEL = "claude-sonnet-5"
const MAX_TOKENS_CAP = 8000
const MAX_BODY_BYTES = 20 * 1024 * 1024 // statement images are base64; 4×5MB + slack
// Daily per-user cap (input+output). ~40–60 statement-import turns; costs stay
// bounded to a few USD/user/day worst case.
const DAILY_TOKEN_BUDGET = 2_000_000

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

function corsHeadersFor(req: Request): Record<string, string> {
  const requested = req.headers.get("Access-Control-Request-Headers")
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      requested ?? "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

// verify_jwt has already validated the signature; we only need the subject.
function userIdFrom(req: Request): string | null {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "")
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req)
  if (req.method === "OPTIONS") return new Response(null, { headers: cors })
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors)
  if (!ANTHROPIC_API_KEY) return json(500, { error: "Server missing ANTHROPIC_API_KEY secret" }, cors)

  const userId = userIdFrom(req)
  if (!userId) return json(401, { error: "No authenticated user" }, cors)

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: "Request too large — try fewer or smaller images" }, cors)
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { error: "Invalid JSON body" }, cors)
  }

  const { system, tools, messages, prompt_version } = body
  if (!Array.isArray(messages)) return json(400, { error: "Missing messages" }, cors)
  const maxTokens = Math.min(
    typeof body.max_tokens === "number" ? body.max_tokens : MAX_TOKENS_CAP,
    MAX_TOKENS_CAP,
  )

  // Budget check: tokens used in the trailing 24h.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: usageRows, error: usageErr } = await admin
    .from("ai_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .gte("created_at", since)
  if (usageErr) return json(500, { error: "Usage check failed" }, cors)
  const used = (usageRows ?? []).reduce((s, r) => s + r.input_tokens + r.output_tokens, 0)
  if (used >= DAILY_TOKEN_BUDGET) {
    await admin.from("ai_usage").insert({
      user_id: userId, model: ALLOWED_MODEL,
      prompt_version: typeof prompt_version === "number" ? prompt_version : null,
      status: "over_budget",
    })
    return json(429, { error: { type: "budget", message: "Daily AI budget reached — resets within 24 hours." } }, cors)
  }

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: ALLOWED_MODEL, max_tokens: maxTokens, system, tools, messages }),
  })

  const text = await anthropicRes.text()

  // Log the turn (best-effort; never blocks the response).
  let inputTokens = 0, outputTokens = 0
  try {
    const usage = JSON.parse(text)?.usage
    inputTokens = usage?.input_tokens ?? 0
    outputTokens = usage?.output_tokens ?? 0
  } catch { /* non-JSON error body */ }
  await admin.from("ai_usage").insert({
    user_id: userId,
    model: ALLOWED_MODEL,
    prompt_version: typeof prompt_version === "number" ? prompt_version : null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    status: anthropicRes.ok ? "ok" : "api_error",
  })

  return new Response(text, {
    status: anthropicRes.status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
})
