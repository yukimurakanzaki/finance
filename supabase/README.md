# Supabase backend (P0)

Cloud backend for the multi-tenant household product. Design: [`../BACKEND.md`](../BACKEND.md). Intent: [`../BRD.md`](../BRD.md).

- **Project:** `fi-dashboard` (ref `lanvhaliejwuazqerbvp`, region ap-northeast-1)
- **Migrations:** `migrations/` — applied in filename order. Tenancy core → RLS → domain tables → RPCs → hardening.
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

## Security posture (advisor)
Clean of criticals: RLS on all tables, no `anon` access, no cross-tenant leakage.
4 residual `WARN`s (0029) are by-design: `create_household`/`accept_invite` are intended
authenticated RPCs; `auth_household_ids`/`is_household_admin` are RLS helpers that
`authenticated` must execute for policies to evaluate. Optional polish: move the two
helpers into a non-API-exposed schema.
