// Proxies chat requests to the Anthropic Messages API using a server-held
// key, so the client never stores or transmits an Anthropic API key itself.
// Auth is enforced by Supabase (verify_jwt) — only the signed-in household
// account can invoke this function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
const ANTHROPIC_VERSION = "2023-06-01"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Server missing ANTHROPIC_API_KEY secret" }), {
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

  const { model, max_tokens, system, tools, messages } = body as Record<string, unknown>
  if (typeof model !== "string" || typeof max_tokens !== "number" || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Missing model, max_tokens, or messages" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens, system, tools, messages }),
  })

  const text = await anthropicRes.text()
  return new Response(text, {
    status: anthropicRes.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
