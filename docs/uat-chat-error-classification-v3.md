# UAT — Chat Error Classification (v3)

Manual test plan for commit `65bb4a9`. Covers the three error classes the
proxy now distinguishes, the client-side retry behavior, and the budget
sentinel regression that v2 introduced.

## What v3 changed

| Error source | Status sent | Body envelope | Client behavior |
|---|---|---|---|
| Upstream 400/413/422/451 (bad input) | forwarded as-is | `{ error: { type: "upstream_4xx", upstream_status, message } }` | surface immediately, **no retry** |
| Upstream 408/409/429/5xx | 502 | `{ error: { type: "transient", upstream_status, message } }` | **retry once** after 1.5s, then surface |
| Transport throw / missing secret / parse | 502 | `{ error: { type: "transient", upstream_status: 0, message } }` | **retry once** after 1.5s, then surface |
| Daily budget hit | 429 | `{ error: { type: "budget", message } }` | surface "Today's AI allowance is used up" |

Pre-v3 (v2), the proxy collapsed everything to 502 and the client read the
bare HTTP status. Upstream rate-limit (429) was masquerading as the budget
sentinel — this UAT verifies that's fixed.

## Pre-flight

1. Deploy the proxy: `supabase functions deploy anthropic-proxy`
2. Deploy the front-end: push the branch to trigger Vercel, or run locally
3. Sign in as a test user (one whose `ai_usage` row count is well below the
   2,000,000 daily token budget — otherwise scenario C is unreachable)
4. Open the AI Manager chat panel
5. Open DevTools → Network tab. Filter on `anthropic-proxy`. Keep it open
   for the whole session.

Each scenario below is independent. Pass = expected result observed in the
chat UI AND the proxy response matches the table above. Fail = either
message text wrong, retry behavior wrong, or wrong status code visible in
Network tab.

---

## Scenario A — transient 5xx recovers on retry

This is the user-facing requirement #2. Should be invisible to the user if
it works: hiccup self-heals.

**Setup:** a way to make the upstream return 502 exactly once, then succeed.

**Manual injector (easiest):**
1. In Supabase dashboard → Edge Functions → Secrets, temporarily rename
   `GOOGLE_API_KEY` (e.g. prepend `BROKEN_`) and redeploy the proxy.
2. Send one chat message. The Gemini call will 401 → folded to 502 transient.
3. The client retries. The second attempt also 502s.
4. Restore the secret and redeploy.

**Expected:**
- First attempt fails with 502 transient envelope
- Second attempt fails with 502 transient envelope
- After ~1.5s, the user sees the sanitized error message (e.g. "API key not valid")
- No retry storms — exactly one retry, then give up
- Status badge returns to "Ready" (not stuck on "Thinking…")
- Total round-trip time ≈ 3s (initial + 1.5s delay + retry)

**Pass criteria:** user sees a real, non-generic error message; doesn't see
the old "Edge Function returned a non-2xx status code" text.

**Fail mode to watch for:** message starts with "Proxy error: " — that would
mean the sanitization strip on the client didn't fire (sanitizer regression).

---

## Scenario B — permanent 4xx surfaces without retry (the budget regression test)

This is the v2 regression that v3 fixed. Critical: the message must NOT
contain "Today's AI allowance is used up".

**Setup:** force the upstream to return a 4xx. Easiest way:
1. Temporarily set `GOOGLE_API_KEY=BAD` (any non-functional value)
2. Send a chat message
3. Gemini returns 400 "API key not valid" (or similar 4xx)
4. v2 client would see status 400, miss the budget branch (it only fired on
   429), and surface the raw message. Good — that part wasn't broken.
5. The actually-broken case is **429 from upstream**: temporarily set the
   rate so a single call hits upstream 429. Easiest: send many large
   requests back-to-back until Gemini rate-limits.

**Expected:**
- User sees the real error message ("API key not valid" or "rate limited")
- Message does **NOT** contain "Today's AI allowance is used up"
- Message does **NOT** contain "resets within 24 hours"
- Network tab shows the proxy returned `502 transient` (not 400/429),
  because Gemini 429 got folded into the retry class

**Pass criteria:** user is NOT misled into thinking their AI allowance ran
out when actually the provider rate-limited them.

**Fail mode to watch for:** error message starts with "Today's AI allowance
is used up" — that means the client is still trusting the bare status code
(v2 regression came back).

---

## Scenario C — daily budget sentinel still works

This is the test that v2 accidentally broke. The legitimate budget path
must still produce the friendly message.

**Setup:** hit the daily token cap. Two options:
- Easy: temporarily set `DAILY_TOKEN_BUDGET` to a tiny number (e.g. 10) and
  redeploy. Send one chat message.
- Realistic: edit `ai_usage` directly in Supabase to insert a row with
  `input_tokens=2_000_000` from your user_id, then send one chat message.

**Expected:**
- User sees: **"Today's AI allowance is used up — it resets within 24 hours.
  Your data and the rest of the app are unaffected."**
- Network tab shows the proxy returned `429` with body
  `{ error: { type: "budget", message: "Daily AI budget reached..." } }`
- The 429 status code is honored this time because the proxy emits the
  `type: "budget"` envelope — the client keys off the type, not the status.

**Pass criteria:** friendly message appears exactly as in the v1 era (before
this fix series).

**Fail mode to watch for:** user sees the raw "Daily AI budget reached"
string instead of the friendly wrapper. That means the client's budget
branch ran but didn't map to the friendly string — would indicate the
`error.message → 'BUDGET_EXCEEDED' → friendlyMsg` chain broke.

---

## Scenario D — Gemini key leak closed

**Setup:** make the proxy's outbound fetch to Google fail with a
network-level error (DNS, TLS, connection refused). Easiest:
1. Temporarily change the Gemini URL in `anthropic-proxy/index.ts` to an
   unreachable host: `https://generativelanguage.googleapis.invalid/...`
2. Redeploy.
3. Send a chat message.

**Expected:**
- Error message visible in chat UI does NOT contain `GOOGLE_API_KEY` value
- Error message does NOT contain the original URL `generativelanguage.googleapis.com`
  (it'll show the sanitized `<redacted>` form, or the unreachable host)
- Check the proxy's server logs (Supabase dashboard → Logs) — the full
  un-sanitized error including the URL appears there. That's intentional:
  logs are for ops, response body is for users.

**Pass criteria:** `grep -i GOOGLE_API_KEY` on the user's chat UI returns
zero matches.

**Fail mode to watch for:** any string in the user-visible error contains
a substring of the actual API key. That means sanitize isn't running, or
the regex let it through. Re-check `_shared/errors.ts`.

---

## Scenario E — sanity check the happy path didn't regress

**Setup:** none. Just send a normal chat message.

**Expected:**
- Message goes through, response streams back as before
- No retry happens (no extra latency)
- No new error envelope visible
- Tokens counted normally in `ai_usage`

**Pass criteria:** the chat works end-to-end with no observable change vs.
the pre-fix state.

---

## Pass / fail summary

| # | Scenario | Pass criteria | Result |
|---|---|---|---|
| A | transient 5xx recovers | real error surfaced, no "Edge Function" generic text | ☐ |
| B | permanent 4xx / upstream 429 | no false "budget exhausted" message | ☐ |
| C | daily budget sentinel | friendly message still appears | ☐ |
| D | Gemini key leak closed | no key in chat UI | ☐ |
| E | happy path | unchanged behavior | ☐ |

All five must pass before merging to `main`. Scenario B is the most
important — it's the v2 regression that v3 was created to fix.

## Rollback

If any scenario fails, the change is self-contained in 4 files
(`chatStore.ts`, `anthropic-proxy/index.ts`, `_shared/errors.ts`,
`_shared/errors.test.ts`). Revert the commit:
`git revert 65bb4a9`. The proxy's classification is purely additive —
reverting sends the old "Proxy error: …" message and 502 status for
everything, which is what the system did before v3 (and v2).