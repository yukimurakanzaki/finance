// Proxies chat requests to Google Gemini or Anthropic API based on the model param.
// Auth is enforced by Supabase (verify_jwt) — only signed-in users can invoke.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")

// Model routing table — model id → { provider, apiModel }
const MODEL_ROUTES: Record<string, { provider: "google" | "anthropic"; apiModel: string }> = {
  "gemini-2.5-flash": { provider: "google", apiModel: "gemini-2.5-flash" },
  "gemini-2.5-pro": { provider: "google", apiModel: "gemini-2.5-pro" },
  "claude-sonnet-4-20250514": { provider: "anthropic", apiModel: "claude-sonnet-4-20250514" },
}

function corsHeadersFor(req: Request): Record<string, string> {
  const requested = req.headers.get("Access-Control-Request-Headers")
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      requested ?? "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  const corsHeaders = corsHeadersFor(req)

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { model, max_tokens, system, tools, messages } = body as Record<string, unknown>
  if (typeof max_tokens !== "number" || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Missing max_tokens or messages" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // Model allowlist
  const modelId = typeof model === "string" ? model : "gemini-2.5-flash"
  const route = MODEL_ROUTES[modelId]
  if (!route) {
    return new Response(JSON.stringify({ error: `Unknown model: ${modelId}. Allowed: ${Object.keys(MODEL_ROUTES).join(", ")}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const result = route.provider === "google"
      ? await callGemini(route.apiModel, max_tokens, system as string | undefined, tools as unknown[] | undefined, messages)
      : await callAnthropic(route.apiModel, max_tokens, system as string | undefined, tools as unknown[] | undefined, messages)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: `Proxy error: ${String(err)}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
