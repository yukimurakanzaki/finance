# FI Dashboard — Requirements Baseline
**Version:** 1.1 · **Date:** 2026-07-03 · **Status:** Elicited from product owner (Yuki), first formal baseline

**Progress note (2026-07-03):** SR-1.6 and SR-2.8 are done, ahead of the rest of Phase 1/2, at the product owner's request (his wife didn't want to manage a personal Anthropic key). A dedicated Supabase project (`fi-dashboard`) now hosts an `anthropic-proxy` Edge Function holding the Anthropic key server-side, gated by Supabase Auth (`verify_jwt`). This pulled forward a thin slice of SR-2.3 (one shared household login) for the chat feature only — the rest of Phase 2 (household-scoped Postgres schema for accounts/transactions/etc., replacing Dexie as system of record) has **not** started. Everything else in the app is still local-first IndexedDB, per the original phase ordering.
## 0. Why this document exists

Five sprints of code exist (`ea0e7a7`..`3f7e7b0`) and zero requirements documents preceded them. `ARCHITECTURE.md` describes *how* the app is built; nothing describes *what it's for* or *who decided that*. Every prior decision — no server, no auth, no sync — was made implicitly by whoever prompted the sprint, not deliberately by the product owner. This document is the first deliberate pass. It was produced by direct elicitation (not assumption), and it obsoletes the "no server / no sync / no auth" decisions baked into `ARCHITECTURE.md` §1. That file's decision table is now **stale as of this document** and must be revised alongside the Phase 2 work in §5.

Requirement IDs (`BR-`, `SR-`, `NFR-`, `TR-`) exist so future PRs can cite what they satisfy. Treat unlabeled feature work as scope creep.

---

## 1. Stakeholders

| Role | Who | Stake |
|---|---|---|
| Product owner / primary user | Yuki | Uses the app daily to decide safe-to-spend and track FI progress. Final authority on scope. |
| Secondary user | Household partner | Needs visibility into shared household finances. No product authority (not consulted for this doc — flag before building shared-view auth). |
| Builder | Claude (coding sessions) | Implements sprints against this baseline instead of ad-hoc prompts. |

**Open item:** the partner's actual needs (what they want to see, whether they'll enter data themselves) have not been elicited — Yuki answered on their behalf. Treat household-sharing functional requirements as provisional until confirmed with the partner directly.

---

## 2. Current State Assessment (brutal)

**Correction (this revision):** the original pass of this document was written against a stale checkout that predated two merged PRs (#2, #3) already on `main`. Points 6 and 7 below were wrong as originally written. Corrected in place rather than silently — the whole point of this document is that it be accurate.

What's actually on `main`, verified against the repo, not the commit messages:

1. **The app is real and reasonably complete for single-device, single-user, manual-entry use.** Net worth tracking, safe-to-spend waterfall, envelope/lane budgeting, recurring items, FI projection, PIN lock, CSV/JSON reconcile import, onboarding — all present in `src/features/`.
2. **Testing is decorative.** `vitest` is a devDependency, `package.json` has a `test` script, and there is not one `*.test.ts` file in the repo. `fiProjection.ts`, `safeToSpend.ts`, and `savingsRate.ts` — the functions that tell you whether you can retire and whether you can spend money today — have never been asserted against a single expected value. Confidence in the numbers is currently faith, not verification.
3. **There is no CI.** No `.github/workflows`, no lint gate, no build gate. `biome.json` exists but nothing enforces it runs. Every merge to date has been trust-based.
4. **The "no server / no network" architecture decision is already broken in practice, not just incompatible with future plans.** `ARCHITECTURE.md` line 86 states as a *decision*: "No server — No auth, no sync, no network dependency." That statement is currently false:
   - `src/stores/chatStore.ts:66` calls `new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })` — the AI chat feature (`src/features/chat/ChatScreen.tsx`) makes direct browser-to-Anthropic API calls.
   - The user's **raw Anthropic API key is stored unencrypted in IndexedDB** (`settingsRepo.get/set('anthropic_api_key')`) and shipped to Anthropic's API straight from the browser. `dangerouslyAllowBrowser: true` is not a formality — it means there is no server between the key and the public internet. Anyone with device/browser access (or an XSS bug, or a malicious browser extension with storage access) can exfiltrate a live, billable API key.
   - `src/lib/marketPrices.ts` fetches live gold spot and FX rates from two public APIs (`api.gold-api.com`, `open.er-api.com`) directly from the client to auto-price gold/FX assets.
   - Net effect: this is **already** a networked app with **already** a client-side secret-management problem. Phase 2 isn't "adding" a network dependency — it's fixing an existing, live one and adding auth/sync on top. The Anthropic key must move server-side (proxied through a Supabase Edge Function) as part of Phase 2, not treated as a separate future task.
5. **Durability is a single point of failure.** All financial data lives in one browser's IndexedDB. Clearing site data, losing the device, or a corrupted IndexedDB instance loses everything except whatever was last manually exported to JSON. There is no reminder, schedule, or automation around that export. (The Anthropic API key would also be lost — a second, smaller reason this matters.)
6. **There is no automated bank/broker feed, but there is already an AI-assisted import path**, and it's more capable than "manual CSV": `src/features/more/ImportPromptSheet.tsx` generates a copy-paste prompt (with the user's real account IDs and categories embedded) for pasting bank-statement text into an external AI chat to get back structured JSON; separately, the in-app chat's tool set (`src/ai/tools.ts`, 372 lines: `log_transactions`, `log_income`, `add_recurring_item`, `update_asset_value`, `update_account_balance`, `create_account`, `query_transactions`) lets the user paste a bank statement image directly into the in-app AI chat and have it propose transactions for approval. This changes Phase 3 framing: the gap isn't "no import intelligence," it's specifically "no *automated, unattended* bank feed" — a live Plaid-style integration would replace a human-in-the-loop AI step, not create a new capability from zero.
7. **Household sharing does not exist in any form.** There is one PIN, one IndexedDB, one device, and one Anthropic API key shared implicitly by whoever has the device. "Shared PIN, single shared view" is an aspiration, not a feature.

---

## 3. Business Requirements (why this project exists)

- **BR-1**: Give the household (Yuki + partner) a shared, always-current picture of net worth, safe-to-spend, and progress toward financial independence, usable by both people without duplicating data entry.
- **BR-2**: Make the numbers the app shows *trustworthy* — every dollar figure the app asserts (safe-to-spend ceiling, FI date, savings rate) must be backed by a verified calculation, not an unverified one.
- **BR-3**: Eliminate the current single-point-of-failure data durability model. Losing a device must never mean losing financial history.
- **BR-4**: Preserve the low-friction, fast, local-feeling UX the app already has (PWA, offline-capable, PIN-gated quick access) — the migration to a backend must not turn this into a slow, always-online-required web app.
- **BR-5**: Position the app so that live bank/brokerage account aggregation can be added later without another foundational rewrite.

---

## 4. Solution Requirements

### 4.1 Functional Requirements

**Phase 1 — Stabilize the existing local-first app (do this before touching architecture)**

- **SR-1.1**: `fiProjection.ts`, `safeToSpend.ts`, `savingsRate.ts`, `returnRates.ts` each have unit tests covering: normal case, zero/negative balance edge cases, and at least one known-answer regression test with hand-verified expected output.
- **SR-1.2**: Every `src/db/repositories/*.repo.ts` has tests covering create/read/update/delete and at least one atomic-transaction-boundary case (e.g. `importBatch` partially failing must not leave partial writes).
- **SR-1.3**: `src/import/parser.ts`, `validator.ts`, and `transferDetector` worker have tests using at least one real (anonymized) bank CSV export shape, not just the app's own demo format.
- **SR-1.4**: CI pipeline (GitHub Actions) runs on every PR: `biome check`, `tsc -b`, `vitest run`. All three must pass before merge is allowed.
- **SR-1.5**: A manual backup reminder (in-app banner, e.g. "last export: 14 days ago") ships as a stopgap, since automatic cloud backup (BR-3) doesn't land until Phase 2.
- **SR-1.6 (urgent, do not defer to Phase 2)**: Until the Anthropic key moves server-side (SR-2.8), the chat setup screen (`ApiKeySetup` in `ChatScreen.tsx`) must warn the user explicitly that the key is stored unencrypted on-device and sent directly to Anthropic from the browser (`dangerouslyAllowBrowser`), and link to console.anthropic.com to set a spend cap. This is a cheap mitigation for a real, currently-live exposure and should not wait for the Phase 2 backend rebuild.

**Phase 2 — Backend, auth, household sharing**

- **SR-2.1**: Introduce Supabase (Postgres + Auth + Storage) as the backend. Replace Dexie/IndexedDB as the system of record; IndexedDB may remain as an offline cache layer (see NFR-4) but Postgres is authoritative.
- **SR-2.2**: Data model introduces a `household` entity from day one, even though only one shared login exists initially — every table (`accounts`, `transactions`, `assets`, `recurring_items`, `snapshots`, etc.) is scoped by `household_id`, not by an individual user, so per-person attribution can be added later (BR-5-adjacent: don't rebuild the schema twice).
- **SR-2.3**: Authentication: one shared Supabase account per household (email+password or magic link), used by both Yuki and partner. The existing device PIN becomes a *local re-auth* layer on top of an active Supabase session (like an app lock), not a replacement for real authentication.
- **SR-2.4**: All existing screens (Home, Budget, Reconcile, Decide, More) read/write through the Supabase-backed repositories instead of Dexie repositories. UI/UX and screen structure do not change as part of this migration — this is a data-layer swap, not a redesign.
- **SR-2.5**: Existing local IndexedDB data is **not** migrated (per elicitation: confirmed test/demo data). Users re-onboard against the new backend. The onboarding wizard (`OnboardingWizard.tsx`) must still work unmodified against the new data layer.
- **SR-2.6**: Automatic encrypted backup: Postgres data is durable by virtue of being in Supabase (point-in-time recovery / managed backups) — this satisfies BR-3 without a separate local-backup feature, per elicitation.
- **SR-2.7**: Offline writes queue locally and sync when connectivity returns (see NFR-4) — the app must not become unusable on a subway or a plane.
- **SR-2.8**: The Anthropic API key moves out of client storage entirely. Chat requests are proxied through a Supabase Edge Function that holds the key server-side (Vault-encrypted); the client sends only the conversation/tool-call payload, never the key. This closes the exposure documented in §2.4 and is a Phase 2 requirement, not optional cleanup.
- **SR-2.9**: The live market-price fetches in `src/lib/marketPrices.ts` (gold spot, FX) are re-pointed through the same Supabase Edge Function layer as SR-2.8, both for consistency (one server-side egress point instead of two) and because a server-side call can be cached/rate-limited across the household instead of duplicated per device.

**Phase 3 — Bank/brokerage sync (future, not immediate)**

- **SR-3.1**: Integrate a bank aggregation provider (e.g. Plaid) for automated transaction and balance import, replacing manual CSV reconcile as the primary (not exclusive) import path.
- **SR-3.2**: Provider access tokens are stored server-side only (Supabase Edge Function / Vault-encrypted column) — never in the client, never in IndexedDB.
- **SR-3.3**: Incoming synced transactions run through the existing `transferDetector` and validator pipeline (`src/import/`) so dedup/transfer-matching logic isn't duplicated for a second import path.
- **SR-3.4**: Reconcile screen (`ReconcileEntryScreen`/`ReconcileConfirmScreen`) is extended, not replaced, to handle provider-sourced rows alongside manual/CSV rows.

### 4.2 Non-Functional Requirements

- **NFR-1 (Security)**: A single shared household login is a known, accepted risk (no per-person attribution, credential-sharing risk) — explicitly accepted by the product owner, not an oversight. Document it as a risk in §6, revisit if the partner is later consulted and wants their own login (schema already supports it per SR-2.2).
- **NFR-2 (Privacy)**: Financial data is never sent to any third party except the chosen backend (Supabase), Anthropic (for the AI chat feature, already in production use), and, in Phase 3, the bank-aggregation provider. No analytics/telemetry SDKs.
- **NFR-7 (Secrets management)**: No API key, access token, or credential is ever stored in client-side storage (IndexedDB, localStorage) or bundled into client code, starting with the Anthropic key at Phase 2 (SR-2.8) and continuing through Phase 3's bank-provider tokens (SR-3.2). This is a standing constraint on all future integrations, not a one-time fix.
- **NFR-3 (Performance)**: Home screen net-worth/safe-to-spend figures render from cached/local data in <200ms perceived latency even when the network round-trip to Supabase hasn't completed yet — this is why NFR-4's local cache layer matters, not just for offline support.
- **NFR-4 (Offline behavior)**: The app remains usable read-only (and ideally queue-and-sync for writes) with no network connection. This must be an explicit design requirement for the Phase 2 migration, not an accidental casualty of moving to a server-backed model.
- **NFR-5 (Reliability)**: CI (SR-1.4) blocks merges on failing tests/lint/build starting immediately at Phase 1, and continues to gate all Phase 2/3 work — "full test + CI gate" was an explicit, non-negotiable elicitation answer.
- **NFR-6 (PWA parity)**: Installability, offline shell caching, and app-like behavior (`vite-plugin-pwa`) must survive the backend migration unchanged.

---

## 5. Transition Requirements

The product owner explicitly rejected doing this in one sprint ("brutal honesty: trying to do it all in one sprint is how you got here"). Sequencing below is a requirement, not a suggestion — each phase must ship and be usable before the next starts.

- **TR-1**: **Phase 1 exit criteria** (must all be true before Phase 2 starts): CI pipeline green on main; `engine/` and `db/repositories/` have passing tests per SR-1.1/1.2; import pipeline has at least one real-bank-shaped test fixture per SR-1.3.
- **TR-2**: **Phase 2 entry**: `ARCHITECTURE.md` is revised (not just this doc) to remove or supersede the "No server / No auth / No sync" decision row, so the two documents don't contradict each other.
- **TR-3**: **Data cutover**: since existing local data is confirmed disposable (SR-2.5), no migration script is required — but the *decision to discard* must be visible in the PR/release notes so it isn't mistaken for a bug later.
- **TR-4**: **Auth cutover**: households onboard fresh into Supabase Auth; the existing local PIN mechanism (`pinStore.ts`, `PinLockScreen.tsx`) is repurposed as a device-level re-lock on top of the Supabase session per SR-2.3, not deleted and not left as the sole gate.
- **TR-5**: **Rollback plan**: Phase 2 ships behind a config flag or separate deploy until it's confirmed both household members can log in and see live data; the local-first build remains the fallback until that's confirmed, then is retired.
- **TR-6**: **Partner onboarding**: before Phase 2 is considered "done," the partner must actually log in, enter or view real data, and confirm the shared-view model (NFR-1's accepted risk) works for them in practice — this closes the "not consulted" gap flagged in §1.
- **TR-7**: **Phase 3 entry**: not scheduled against a date; entry criterion is Phase 2 running in production for the household with no open reliability issues, plus an explicit go/no-go decision on a bank-aggregation provider (cost, supported institutions, compliance) before any integration work starts.
- **TR-8**: **Documentation debt**: this document and `ARCHITECTURE.md` are kept in sync at every phase boundary; a phase is not "done" until both are updated to reflect reality.

---

## 6. Constraints, Assumptions, and Accepted Risks

- **Assumption**: "Household" means exactly two people (Yuki + one partner) for the foreseeable future — not a multi-tenant product for strangers. If that changes, NFR-1's shared-login risk acceptance must be revisited.
- **Constraint**: Backend platform is Supabase (Postgres + Auth + Storage) — chosen directly by the product owner, not inferred from tool availability alone.
- **Accepted risk**: Single shared household credential (NFR-1) — no per-person attribution or access control within the household at launch.
- **Accepted risk**: Existing local IndexedDB data is discarded, not migrated (SR-2.5) — confirmed as acceptable since it's test/demo data.
- **Deferred decision**: Choice of bank-aggregation provider, its cost, and country/institution coverage is explicitly out of scope until Phase 3 entry (TR-7).

## 7. Out of Scope (for now)

- Per-person login/permissions within a household (schema supports it later; not built now).
- Multi-tenant support for households beyond Yuki's own.
- Any bank/brokerage integration work (Phase 3 is scoped for planning only, not implementation, until TR-7's go/no-go).
- Data migration tooling for the current local dataset (confirmed disposable).

## 8. Open Risks Requiring Follow-Up

1. Partner's actual requirements are unelicited (see §1) — Phase 2 is not "done" until TR-6 closes this.
2. Shared single credential is a real security tradeoff, accepted here, but should be revisited if scope ever grows beyond two people.
3. Bank-aggregation provider choice (Plaid vs. alternatives) has cost and compliance implications not yet evaluated — do not start Phase 3 without TR-7's explicit go/no-go.
