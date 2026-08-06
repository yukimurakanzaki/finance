# Current Session

**Date:** 2026-08-06
**Branch:** `sprint1/t5-onboarding`
**Status:** T5 (onboarding) committed; docs correction applied

> This file replaces the stale 2026-07-27 handoff that had been restored from a
> `git stash` at `77c4491` (142 commits behind main). That content described a
> paper/ink light-theme "Phase 3" that never shipped and is now discarded.

---

## Summary

Two things this session:

1. **T5 — onboarding** (already committed before this session's doc work):
   - `100e137` onboarding state + snooze + wizard step lift
   - `d9af909` review fixes — wire `resolveWizardStep`, string-compare snooze,
     TR-1.2 test, snooze setter
   - `7aa8bc3` repair type errors in onboarding tests and snooze helper
   - `b25a998` onboarding jump target (`activeTab` + wizard entry step)

2. **Fixed the type-check command documented in `CLAUDE.md`.**
   `npx tsc --noEmit` was a **silent no-op**: the root `tsconfig.json` is
   `"files": []` plus project references, so plain `tsc` resolves zero input
   files and always exits 0. Verified with `--listFiles`: 0 files checked, vs.
   593 under `-p tsconfig.app.json`. Every "tsc clean" gate in the workflow docs
   was therefore passing vacuously. Replaced with `npx tsc -b --noEmit` (build
   mode walks the references) in all four places it appeared: the Commands
   block, Development Workflow step 5, the Review Checklist, and the Definition
   of Done.

## Files Changed

- `CLAUDE.md` — `tsc` command corrected in 4 locations + explanatory comment
- `docs/session.md` — this rewrite

## Verification

- `npx tsc -b --noEmit` — clean (593 files actually checked)
- `npx vitest run` — 34 files, **307 passing, 0 failing**
  (CLAUDE.md's "256 passing as of 2026-07-31" is now out of date)

### Retroactive check of the vacuous gate — clean

Ran `npx tsc -b --noEmit --force` against all three commits that "main" can mean
here, in a throwaway worktree (`node_modules` junctioned in, removed afterwards):

| ref | commit | result |
|---|---|---|
| local `main` | `f3afc49` | clean |
| `origin/main` | `655e337` | clean |
| `origin/claude/fi-dashboard-safe-to-spend-ot3w4b` (T5 PR base) | `507c5c4` | clean |

Confirmed non-vacuous via `--listFiles`: 172 project files (excluding
`node_modules`) checked on `507c5c4`. So the no-op `tsc` command did **not** let
any latent type errors into merged code — the risk noted below turned out empty.

Note for future checks: the three refs are genuinely different commits. Local
`main` is the T5 branch base, not the PR target.

## Remaining Tasks

- Sprint 1 queue: see `docs/plans/2026-07-25-sprint-1-builder-brief.md`
- T5 branch is unmerged — open PR against
  `claude/fi-dashboard-safe-to-spend-ot3w4b` when ready
- ~~Re-run `npx tsc -b --noEmit` across recent branches~~ — done this session,
  all three main candidates clean (see Verification above)

## Known Issues / Risks

- **The type gate was never enforcing anything until this session.** Treat any
  "tsc clean" claim in commits before `b25a998` as unverified — though a
  retroactive check of all three main candidates came back clean, so nothing
  appears to have slipped through in practice.
- ~220 pre-existing biome lint errors remain out of scope (untouched files).
- `npx biome check src` reports ~408 on a Windows checkout; the extra ~188 are
  CRLF artifacts, not code problems. Prefer `biome lint`.

## Suggested Next Task

Open the T5 PR against `claude/fi-dashboard-safe-to-spend-ot3w4b`, then pick up
the next open Sprint 1 task from
`docs/plans/2026-07-25-sprint-1-builder-brief.md`.
