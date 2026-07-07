# Supabase backend (P0 + Phase A)

Cloud backend for the multi-tenant household product. Design: [`../BACKEND.md`](../BACKEND.md). Intent: [`../BRD.md`](../BRD.md). Phase A scope: [`../PROPOSAL.md`](../PROPOSAL.md) §3.

- **Project:** `fi-dashboard` (ref `lanvhaliejwuazqerbvp`, region ap-northeast-1)
- **Staging:** blocked on the free-tier 2-project limit (Storyforge occupies the other slot) — pause it, upgrade, or defer to Phase B.
- **Migrations:** `migrations/` — applied in filename order. Tenancy core → RLS → domain tables → RPCs → hardening → **Phase A (0006–0011): pass_through lane, engine_version, household timezone, audit schema (immutable, triggered), export/delete RPCs (UU PDP), ai_usage ledger.**
- **Tenancy boundary:** every domain row carries `household_id`; RLS isolates households via the recursion-safe `auth_household_ids()` / `is_household_admin()` helpers. This is verified by `tests/rls_isolation_test.sql`.
- **Money:** integer rupiah (`BIGINT`) everywhere — never float.
- **Not in P0:** billing (Xendit), realtime sync, client outbox. See BACKEND.md §9.

## Apply
Managed via the Supabase MCP / dashboard, or the CLI:
```
supabase link --project-ref lanvhaliejwuazqerbvp
supabase db push
```

## Test isolation
```
psql "$DATABASE_URL" -f tests/rls_isolation_test.sql   # prints 'RLS ISOLATION: PASS'
```
Phase A extended the suite: audit-trail tenancy + immutability, export/delete
cross-tenant refusal, pass_through lane validity. Last run green against prod
schema 2026-07-07 (transaction rolled back). CI hook: `.github/workflows/ci.yml`
runs it when `STAGING_DATABASE_URL` is configured.

## Security posture (advisor, post-Phase A)
Clean of criticals: RLS on all tables, no `anon` access, no cross-tenant leakage; audit
schema is insert-only via DEFINER triggers (immutability asserted by the isolation test).
6 residual `WARN`s (0029) are by-design authenticated DEFINER RPCs: `create_household`,
`accept_invite`, `export_household` (member-gated), `delete_household` (admin-gated,
audit-logged), plus the two RLS helpers. Optional polish: move helpers to a non-API schema.
Auth hardening (2026-07-07): secure email change + secure password change enabled.
**Leaked-password protection: Pro-plan-only — accepted residual risk while the only
users are the owner household. Becomes a hard prerequisite for Phase D (friend beta);
the Pro upgrade that unblocks the staging project also unlocks it.** The advisor WARN
for it stays open by design until then.
