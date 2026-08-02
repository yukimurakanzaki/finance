// Tests for the proxy's shared error helpers. These cover the rules that
// classify upstream failures into retry vs. surface-now, plus the sanitizer
// that strips secrets before they reach the client.
//
// Lives in supabase/functions/_shared/errors.test.ts so vitest picks it up
// without any Deno dependency.
import { describe, it, expect } from 'vitest'
import {
  UpstreamError,
  PERMANENT_USER_INPUT_STATUSES,
  sanitizeError,
  classifyProxyError,
} from './errors'

describe('PERMANENT_USER_INPUT_STATUSES', () => {
  it('includes 400/413/422/451 (caller-input errors that retrying won\'t fix)', () => {
    expect(PERMANENT_USER_INPUT_STATUSES.has(400)).toBe(true)
    expect(PERMANENT_USER_INPUT_STATUSES.has(413)).toBe(true)
    expect(PERMANENT_USER_INPUT_STATUSES.has(422)).toBe(true)
    expect(PERMANENT_USER_INPUT_STATUSES.has(451)).toBe(true)
  })

  it('excludes 408/409/429 (transient-by-nature 4xx that should retry)', () => {
    // v2 regression: these were wrongly forwarded as user errors.
    expect(PERMANENT_USER_INPUT_STATUSES.has(408)).toBe(false)
    expect(PERMANENT_USER_INPUT_STATUSES.has(409)).toBe(false)
    expect(PERMANENT_USER_INPUT_STATUSES.has(429)).toBe(false)
  })

  it('excludes 401/403 (provider auth failures are infra, not user input)', () => {
    // Exposing "invalid x-api-key" to end users leaks server config state.
    expect(PERMANENT_USER_INPUT_STATUSES.has(401)).toBe(false)
    expect(PERMANENT_USER_INPUT_STATUSES.has(403)).toBe(false)
  })
})

describe('UpstreamError', () => {
  it('preserves the upstream status and a useful name', () => {
    const e = new UpstreamError(429, 'rate limited')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('UpstreamError')
    expect(e.upstreamStatus).toBe(429)
    expect(e.message).toBe('rate limited')
  })
})

describe('classifyProxyError', () => {
  it('forwards permanent 400 as upstream_4xx envelope, status 400', () => {
    const r = classifyProxyError(new UpstreamError(400, 'messages field required'))
    expect(r.httpStatus).toBe(400)
    expect(r.body.error.type).toBe('upstream_4xx')
    expect(r.body.error.upstream_status).toBe(400)
    expect(r.body.error.message).toBe('messages field required')
  })

  it('forwards permanent 422 as upstream_4xx, status 422', () => {
    const r = classifyProxyError(new UpstreamError(422, 'invalid tool schema'))
    expect(r.httpStatus).toBe(422)
    expect(r.body.error.type).toBe('upstream_4xx')
  })

  it('folds upstream 429 (rate-limit) into transient/502 — not a user budget error', () => {
    // This is the v2 regression check: upstream rate-limit must NOT be classified
    // as a permanent 4xx that the client surfaces as "budget exceeded".
    const r = classifyProxyError(new UpstreamError(429, 'rate limited; retry after 30s'))
    expect(r.httpStatus).toBe(502)
    expect(r.body.error.type).toBe('transient')
    expect(r.body.error.upstream_status).toBe(429)
  })

  it('folds upstream 408 (timeout) into transient/502', () => {
    const r = classifyProxyError(new UpstreamError(408, 'request timeout'))
    expect(r.httpStatus).toBe(502)
    expect(r.body.error.type).toBe('transient')
  })

  it('folds upstream 409 (conflict) into transient/502', () => {
    const r = classifyProxyError(new UpstreamError(409, 'concurrent request in progress'))
    expect(r.httpStatus).toBe(502)
    expect(r.body.error.type).toBe('transient')
  })

  it('keeps upstream 5xx as transient/502', () => {
    const r = classifyProxyError(new UpstreamError(502, 'bad gateway'))
    expect(r.httpStatus).toBe(502)
    expect(r.body.error.type).toBe('transient')
    expect(r.body.error.upstream_status).toBe(502)
  })

  it('treats plain Error (transport/parse/missing-secret) as transient with upstream_status=0', () => {
    const r = classifyProxyError(new Error('Server missing GOOGLE_API_KEY secret'))
    expect(r.httpStatus).toBe(502)
    expect(r.body.error.type).toBe('transient')
    expect(r.body.error.upstream_status).toBe(0)
    expect(r.body.error.message).toBe('Server missing GOOGLE_API_KEY secret')
  })

  it('handles non-Error throws', () => {
    const r = classifyProxyError('something weird happened')
    expect(r.httpStatus).toBe(502)
    expect(r.body.error.type).toBe('transient')
    expect(r.body.error.message).toBe('something weird happened')
  })
})

describe('sanitizeError', () => {
  it('strips query strings from URLs in the message', () => {
    const out = sanitizeError('failed: https://example.com/api?key=AIzaSECRET&token=abc123 did not work')
    expect(out).not.toContain('AIzaSECRET')
    expect(out).not.toContain('token=abc123')
    // The "?" in prose is preserved (this regression was the v2 sanitizer bug)
    expect(out).toContain('?<redacted>')
  })

  it('leaves bare question marks in prose alone', () => {
    // The v2 regression: sanitizer ate "? The field" in validation messages.
    const out = sanitizeError('Did you mean `messages`? The field is required.')
    expect(out).toBe('Did you mean `messages`? The field is required.')
  })

  it('redacts label-anchored bearer/key/token strings', () => {
    expect(sanitizeError('authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload')).toMatch(/authorization:\s*Bearer=<redacted>/i)
    expect(sanitizeError('key=sk_live_abcdef1234567890XYZ')).toContain('key=<redacted>')
  })

  it('redacts Anthropic sk-ant-api03-… secrets even without a label', () => {
    const out = sanitizeError('failed authentication: sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
    expect(out).not.toContain('sk-ant-api03-abc')
    expect(out).toContain('sk-<redacted>')
  })

  it('redacts OpenAI sk-… secrets even without a label', () => {
    const out = sanitizeError('upstream rejected: sk-abcdefghijklmnopqrstuvwxyz0123456789')
    expect(out).not.toContain('sk-abcdef')
    expect(out).toContain('sk-<redacted>')
  })

  it('redacts Google AIza… secrets even without a label', () => {
    const out = sanitizeError('Google API rejected: AIzaSyD_abc123def456ghi789jkl012mno345pqr678')
    expect(out).not.toContain('AIzaSyD_abc')
    expect(out).toContain('AIza<reducted>')
  })

  it('truncates to 400 chars', () => {
    const huge = 'x'.repeat(2000)
    const out = sanitizeError(huge)
    expect(out.length).toBe(400)
  })

  it('does not over-redact normal text', () => {
    const out = sanitizeError('User canceled the request after 30s.')
    expect(out).toBe('User canceled the request after 30s.')
  })
})