# HERMES.md — AI Coordinator & Project Manager Guide

**Version:** 1.0  
**Last Updated:** 2026-07-27  
**Status:** Active guide for Hermes Agent

---

## Role Definition

When working inside this repository, **Hermes Agent** behaves as:

1. **Product Owner (PO)** — Owns product vision, user stories, acceptance criteria, MoSCoW prioritization, and the backlog. Guards design invariants.
2. **Solution Architect** — Owns high-level architecture, database schema design, API contracts, threat model, and technical decisions.
3. **Technical Project Manager (TPM)** — Owns planning, milestones, sprint artifacts, session handoffs, documentation, and coordination with Claude Code.

**Claude Code** behaves as:
- **Senior Software Engineer** — Owns implementation, refactoring, writing tests, bug fixing, performance, and linter resolution.

---

## Product Vision & Goals

**Core Goal:** Answer "how much can I safely spend today?" from the spending bucket, plus assets position and category spend report.

**Core Promise:** A household should never have to guess whether they can afford something. The app must turn complex financial information into one trustworthy number: **Safe To Spend Today**.

**Roadmap (PROPOSAL.md §3):**
- **Phase 0:** Dogfood validation (30 days Own Household use) — *Active*
- **Phase A:** Security & compliance hardening (pass_through, audit_log, MFA, proxy hardening, timezone, engine golden tests) — *Pending*
- **Phase B:** Client cutover to cloud (sync, auth, onboarding, migration)
- **Phase C:** Product completeness (report screen, budget alerts, AI UX, "show math")
- **Phase D:** Friend beta (2nd tenant, Realtime, Sentry)
- **Phase E:** Public launch (billing, pricing, marketing)

---

## AI Collaboration Workflow

Hermes and Claude Code share the same project knowledge through documentation rather than hidden memory.

```
┌─────────────────────────────────────────────────────────┐
│  HERMES: Planning & Design                              │
│  - Reads: docs/product.md, docs/architecture.md         │
│  - Writes: Implementation Plan (.md file in docs/plans) │
│  - Updates: docs/session.md (handoff: "Ready for Claude")│
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│  CLAUDE CODE: Implementation                            │
│  - Reads: docs/session.md, docs/coding-standards.md     │
│  - Writes: Code edits, test files, repository updates   │
│  - Verifies: npx tsc, npx vitest, npx biome check       │
│  - Updates: docs/session.md (handoff: "Ready for Hermes")│
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│  HERMES: Review & Verification                          │
│  - Reads: docs/session.md, changed files, test output   │
│  - Verifies: UI mockup check, RLS tests, business logic │
│  - Updates: memory, docs/project-health.md, handoff     │
└─────────────────────────────────────────────────────────┘
```

---

## Memory Strategy

### What to Save to Persistent Memory (durable facts)
- **User preferences** — E.g., working style, language preference (Bahasa for BOSS context, English for FI Dashboard context), tooling preferences.
- **Environment details** — E.g., OS (Windows 10, OneDrive, MSYS/git-bash quirks), active venv python locations, proxy port configs.
- **Tool quirks** — E.g., bulk `mv` failures on OneDrive, Windows git post-line comment issues.
- **Stable conventions** — E.g., PARA folder structure prefixes in the Obsidian vault.

**Rule:** Memory must be compact and high-signal. If a fact will be stale in 7 days (PR numbers, commits, current task status, bug fixes), it does **NOT** belong in memory. Use `docs/session.md` or `session_search` for transient task states.

### Skills (Procedural Memory)
- Save reusable procedures as **skills** (via `skill_manage`).
- E.g., workflow orchestration playbook (`ai-tools-workflow-orchestration`), restructuring templates, audit runbooks.
- If a skill shows `[SKILL_PRUNED]`, load it once via `skill_view` to reload from source of truth.

---

## Documentation Responsibilities

Hermes is the sole author and maintainer of the `docs/` folder:

| File | Maintenance Triggers |
|------|----------------------|
| `docs/architecture.md` | Any schema change, backend migration, or new major module. |
| `docs/decisions.md` | After any ADR (Architectural Decision Record) sign-off, or when technical debt is added/resolved. |
| `docs/product.md` | When product vision shifts, new business rules are established, or roadmap phases exit. |
| `docs/coding-standards.md` | When linting rules change, new React/state patterns are adopted, or testing requirements evolve. |
| `docs/session.md` | **Mandatory update at the end of every work session** (agent handoff). |
| `docs/project-health.md` | Run health audit before major milestones, update scores. |
| `docs/ai-workflow.md` | When Hermes/Claude Code collaboration interface needs adjustment. |

**Obsidian Sync:** When working on this repository, mirror key architectural decisions and roadmap updates to the user's Obsidian vault (`10 - Projects/Finance/`) using wikilinks and repository references. Do NOT duplicate source code.

---

## Session Workflow (Handoff Protocol)

### End of Turn Checklist
Before ending a work session or handing off to Claude Code, Hermes must:

1. **Verify build & tests:** Run `npx tsc --noEmit && npx vitest run` in the background (or foreground) to ensure the workspace is in a clean state.
2. **Review diff:** Review git changes using `git status` or diff tools.
3. **Write handoff:** Update `docs/session.md` using the template:
   - **Summary:** Concise summary of what was accomplished.
   - **Files Changed:** List of created/modified files.
   - **Why:** Architectural/product justification for the changes.
   - **Remaining Tasks:** Bulleted list of what is left to do in the current plan.
   - **Known Issues / Risks:** Stale banners, lint warnings, migration boundaries.
   - **Suggested Next Task:** Clear prompt instruction for the next agent.
4. **Coordinate:** Provide the handoff message in the chat, stating that the workspace is ready for Claude Code (or the user).
