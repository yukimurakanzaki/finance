// Proxies chat requests to Google Gemini or Anthropic API based on the model param.
// Hardening (audit D1 + E3):
//  - model allowlisted server-side; max_tokens clamped; request body size capped.
//  - per-user daily token budget enforced against the ai_usage ledger.
//  - every turn logged to ai_usage with prompt_version for regression tracing.
// Auth is enforced by Supabase (verify_jwt) — only signed-in users can invoke.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")

// Model routing table — model id → { provider, apiModel }
const MODEL_ROUTES: Record<string, { provider: "google" | "anthropic"; apiModel: string }> = {
  "gemini-2.5-flash": { provider: "google", apiModel: "gemini-2.5-flash" },
  "gemini-2.5-pro": { provider: "google", apiModel: "gemini-2.5-pro" },
  "claude-sonnet-4-20250514": { provider: "anthropic", apiModel: "claude-sonnet-4-20250514" },
}

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

// ===== GEMINI CONVERSION =====

function convertTools(tools: unknown[]): unknown[] | undefined {
  const fns = tools
    .filter((t: any) => t.name && t.input_schema)
    .map((t: any) => ({
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema,
    }))
  return fns.length > 0 ? [{ functionDeclarations: fns }] : undefined
}

function convertMessages(messages: any[]): any[] {
  const contents: any[] = []
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        contents.push({ role: "user", parts: [{ text: msg.content }] })
      } else if (Array.isArray(msg.content)) {
        const parts: any[] = []
        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push({ text: block.text })
          } else if (block.type === "image") {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data,
              },
            })
          } else if (block.type === "tool_result") {
            contents.push({
              role: "function",
              parts: [{
                functionResponse: {
                  name: block.tool_use_id,
                  response: { content: typeof block.content === "string" ? block.content : JSON.stringify(block.content) },
                },
              }],
            })
            continue
          }
        }
        if (parts.length > 0) {
          contents.push({ role: "user", parts })
        }
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        contents.push({ role: "model", parts: [{ text: msg.content }] })
      } else if (Array.isArray(msg.content)) {
        const parts: any[] = []
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            parts.push({ text: block.text })
          } else if (block.type === "tool_use") {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input,
              },
            })
          }
        }
        if (parts.length > 0) {
          contents.push({ role: "model", parts })
        }
      }
    }
  }
  return contents
}

function fixFunctionResponseNames(messages: any[], contents: any[]): void {
  const idToName = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_use") {
          idToName.set(block.id, block.name)
        }
      }
    }
  }
  for (const c of contents) {
    if (c.role === "function") {
      for (const part of c.parts) {
        if (part.functionResponse) {
          const realName = idToName.get(part.functionResponse.name)
          if (realName) part.functionResponse.name = realName
        }
      }
    }
  }
}

function toAnthropicResponse(geminiData: any, modelName: string): any {
  const candidate = geminiData.candidates?.[0]
  if (!candidate) {
    return {
      id: "msg_" + crypto.randomUUID(),
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "No response from AI." }],
      model: modelName,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    }
  }

  const content: any[] = []
  let stopReason = "end_turn"

  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      content.push({ type: "text", text: part.text })
    } else if (part.functionCall) {
      stopReason = "tool_use"
      content.push({
        type: "tool_use",
        id: "toolu_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      })
    }
  }

  if (content.length === 0) {
    content.push({ type: "text", text: candidate.content?.parts?.[0]?.text || "No response." })
  }

  return {
    id: "msg_" + crypto.randomUUID(),
    type: "message",
    role: "assistant",
    content,
    model: modelName,
    stop_reason: stopReason,
    usage: {
      input_tokens: geminiData.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiData.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}

// ===== PROVIDERS =====

async function callGemini(
  apiModel: string,
  maxTokens: number,
  system: string | undefined,
  tools: unknown[] | undefined,
  messages: any[],
): Promise<any> {
  if (!GOOGLE_API_KEY) throw new Error("Server missing GOOGLE_API_KEY secret")

  const contents = convertMessages(messages)
  fixFunctionResponseNames(messages, contents)

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  }

  if (typeof system === "string" && system) {
    geminiBody.systemInstruction = { parts: [{ text: system }] }
  }

  if (Array.isArray(tools) && tools.length > 0) {
    const converted = convertTools(tools)
    if (converted) geminiBody.tools = converted
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${GOOGLE_API_KEY}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(geminiBody),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini API error (${res.status})`)
  }

  return toAnthropicResponse(data, apiModel)
}

async function callAnthropic(
  apiModel: string,
  maxTokens: number,
  system: string | undefined,
  tools: unknown[] | undefined,
  messages: any[],
): Promise<any> {
  if (!ANTHROPIC_API_KEY) throw new Error("Server missing ANTHROPIC_API_KEY secret")

  const body: Record<string, unknown> = {
    model: apiModel,
    max_tokens: maxTokens,
    messages,
  }
  if (system) body.system = system
  if (tools && tools.length > 0) body.tools = tools

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || `Anthropic API error (${res.status})`)
  }

  return data
}

// ===== HANDLER =====

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req)
  if (req.method === "OPTIONS") return new Response(null, { headers: cors })
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors)

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

  const { model, system, tools, messages, prompt_version } = body
  if (!Array.isArray(messages)) return json(400, { error: "Missing messages" }, cors)
  const maxTokens = Math.min(
    typeof body.max_tokens === "number" ? body.max_tokens : MAX_TOKENS_CAP,
    MAX_TOKENS_CAP,
  )
  const promptVersion = typeof prompt_version === "number" ? prompt_version : null

  // Model allowlist
  const modelId = typeof model === "string" ? model : "claude-sonnet-4-20250514"
  const route = MODEL_ROUTES[modelId]
  if (!route) {
    return json(400, { error: `Unknown model: ${modelId}. Allowed: ${Object.keys(MODEL_ROUTES).join(", ")}` }, cors)
  }

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
      user_id: userId, model: modelId,
      prompt_version: promptVersion,
      status: "over_budget",
    })
    return json(429, { error: { type: "budget", message: "Daily AI budget reached — resets within 24 hours." } }, cors)
  }

  let result: any
  let status: "ok" | "api_error" = "ok"
  let httpStatus = 200
  try {
    result = route.provider === "google"
      ? await callGemini(route.apiModel, maxTokens, system as string | undefined, tools as unknown[] | undefined, messages)
      : await callAnthropic(route.apiModel, maxTokens, system as string | undefined, tools as unknown[] | undefined, messages)
  } catch (err) {
    result = { error: `Proxy error: ${String(err)}` }
    status = "api_error"
    httpStatus = 502
  }

  // Log the turn (best-effort; never blocks the response).
  await admin.from("ai_usage").insert({
    user_id: userId,
    model: modelId,
    prompt_version: promptVersion,
    input_tokens: result?.usage?.input_tokens ?? 0,
    output_tokens: result?.usage?.output_tokens ?? 0,
    status,
  })

  return json(httpStatus, result, cors)
})
