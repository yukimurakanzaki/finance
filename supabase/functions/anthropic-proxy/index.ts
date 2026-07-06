// Proxies chat requests to Google Gemini API, translating from Anthropic format.
// Auth is enforced by Supabase (verify_jwt) — only the signed-in household
// account can invoke this function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
const GEMINI_MODEL = "gemini-2.5-flash"

function corsHeadersFor(req: Request): Record<string, string> {
  const requested = req.headers.get("Access-Control-Request-Headers")
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      requested ?? "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

// Convert Anthropic tool definitions to Gemini function declarations
function convertTools(tools: unknown[]): unknown[] | undefined {
  const fns = tools
    .filter((t: any) => t.name && t.input_schema) // skip server-side tools like web_search
    .map((t: any) => ({
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema,
    }))
  return fns.length > 0 ? [{ functionDeclarations: fns }] : undefined
}

// Convert Anthropic messages to Gemini contents
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
            // Gemini expects function responses as separate entries
            contents.push({
              role: "function",
              parts: [{
                functionResponse: {
                  name: block.tool_use_id, // will be replaced below
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

// Fix tool_result blocks: replace tool_use_id with actual tool name
// by looking up the matching tool_use block in assistant messages
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

// Convert Gemini response back to Anthropic format
function toAnthropicResponse(geminiData: any): any {
  const candidate = geminiData.candidates?.[0]
  if (!candidate) {
    return {
      id: "msg_" + crypto.randomUUID(),
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "No response from AI." }],
      model: GEMINI_MODEL,
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
    model: GEMINI_MODEL,
    stop_reason: stopReason,
    usage: {
      input_tokens: geminiData.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiData.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}

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

  if (!GOOGLE_API_KEY) {
    return new Response(JSON.stringify({ error: "Server missing GOOGLE_API_KEY secret" }), {
      status: 500,
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

  const { max_tokens, system, tools, messages } = body as Record<string, unknown>
  if (typeof max_tokens !== "number" || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Missing max_tokens or messages" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const contents = convertMessages(messages as any[])
    fixFunctionResponseNames(messages as any[], contents)

    const geminiBody: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: max_tokens },
    }

    if (typeof system === "string" && system) {
      geminiBody.systemInstruction = { parts: [{ text: system }] }
    }

    if (Array.isArray(tools) && tools.length > 0) {
      const converted = convertTools(tools)
      if (converted) geminiBody.tools = converted
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(geminiBody),
    })

    const geminiData = await geminiRes.json()

    if (!geminiRes.ok) {
      return new Response(JSON.stringify({
        error: geminiData.error?.message || "Gemini API error",
        status: geminiRes.status,
      }), {
        status: geminiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const anthropicResponse = toAnthropicResponse(geminiData)
    return new Response(JSON.stringify(anthropicResponse), {
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
