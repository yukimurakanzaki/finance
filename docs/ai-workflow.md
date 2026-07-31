# AI Collaboration Workflow — Hermes & Claude Code

**Last Updated:** 2026-07-27  
**Status:** Active collaboration protocol

---

## Overview

FI Dashboard is built and maintained by two AI agents working interchangeably:

- **Hermes Agent** — Product Owner, Solution Architect, Technical Project Manager
- **Claude Code (CLI)** — Senior Software Engineer (implementation, refactoring, tests, bug fixing)

They share the same project knowledge through documentation rather than hidden memory.

---

## Hermes Responsibilities

| Domain | Tasks |
|--------|-------|
| **Planning** | Break product goals into milestones, sprints, and implementation tasks. Write `docs/plans/<name>.md` files with explicit acceptance criteria and deep-review findings. |
| **Documentation** | Maintain `docs/architecture.md`, `docs/decisions.md`, `docs/product.md`, `docs/coding-standards.md`, `docs/session.md`, `docs/project-health.md`, `docs/ai-workflow.md`. |
| **Architecture** | Make high-level decisions (ADR). Review proposed schema changes. Own threat model. Design API contracts. |
| **Product** | Write user stories. Prioritize backlog (MoSCoW). Define acceptance criteria (Given/When/Then). Set story points (Fibonacci). |
| **Memory** | Update persistent memory with durable user preferences and stable conventions. Maintain Obsidian workspace. |
| **Knowledge Base** | Keep the Obsidian vault in sync with repository state via wikilinks. Do NOT duplicate source code. |
| **Session Summaries** | End every session with a handoff update in `docs/session.md`. |

---

## Claude Code Responsibilities

| Domain | Tasks |
|--------|-------|
| **Implementation** | Execute plan .md files. Make code edits through `patch`/`write_file`. Match existing style and conventions. |
| **Refactoring** | Clean up code per `docs/coding-standards.md`. Do not over-refactor. Keep diffs minimal. |
| **Tests** | Write golden tests for engine changes. Run `npx vitest run` before claiming done. Maintain test coverage of every branch and boundary. |
| **Bug Fixing** | Read code, find root causes, fix the class not the symptom. Add regression tests. |
| **Code Generation** | Create new components, hooks, repositories per plan .md files. Use existing patterns. |
| **Performance** | Optimize per `docs/architecture.md` performance budgets. Assert in tests where possible. |

---

## Handoff Protocol

### Hermes → Claude Code

When Hermes finishes planning and Claude Code needs to implement:

1. **Plan file is written:** `docs/plans/<task>.md` contains acceptance criteria, deep-review findings, task breakdown, DoD, and edge cases.
2. **Session handoff updated:** `docs/session.md` says "Ready for Claude Code" with clear next task.
3. **Context is loaded:** Claude Code reads:
   - `CLAUDE.md` (project context)
   - `docs/architecture.md` (system overview)
   - `docs/coding-standards.md` (conventions)
   - `docs/session.md` (latest handoff)
   - Relevant plan file

### Claude Code → Hermes

When Claude Code finishes implementation and Hermes needs to review:

1. **Tests pass:** `npx vitest run` green, `npx tsc --noEmit` clean, no new biome errors
2. **Session handoff updated:** `docs/session.md` says "Ready for Hermes" with summary, files changed, test output
3. **Commits made:** One commit per task, conventional message format

### Hermes Review

When Hermes reviews Claude Code's work:

1. **Verify against plan:** Check all acceptance criteria met
2. **Check edge cases:** Verify all edge cases in plan file handled
3. **Run tests:** `npx vitest run` to confirm no regressions
4. **Visual check (if UI):** Open in browser, verify against design principles
5. **Update docs:** Update `docs/session.md`, `docs/decisions.md` (if ADR), `docs/project-health.md` (if scores changed)
6. **Update memory:** Save durable patterns/learnings to persistent memory or skills

---

## Work Division

### Hermes Owns (Non-Implementation)
- Architecture decisions (ADR)
- Product prioritization
- Sprint planning
- Acceptance criteria
- Risk assessment
- Threat model
- Documentation
- Memory management
- Obsidian sync

### Claude Code Owns (Implementation)
- Code edits
- Test writing
- Bug fixing
- Refactoring
- Performance optimization
- Lint resolution (touched files only)
- Build verification
- Type checking

### Both Contribute
- Code review (Hermes reviews, Claude Code implements)
- Design decisions (Hermes proposes, Claude Code implements)
- Edge case identification (both find, both fix)

---

## Communication Patterns

### Hermes Invokes Claude Code

```bash
# Via delegate_task
delegate_task(
  goal="Implement T0 from PLAN-V2-RESTRUCTURE.md",
  context="Read docs/session.md for handoff. Plan: docs/plans/v2-restructure.md. Verify: npx vitest run green."
)
```

### Claude Code Invokes Hermes (via session handoff)

Claude Code updates `docs/session.md` with:
- Summary of work done
- Files changed
- Test output
- Any deviations from plan
- Suggested next step

Hermes reads the handoff in next session and continues.

---

## Conflict Resolution

If Hermes and Claude Code disagree on approach:

1. **Document the disagreement:** Both write their position in `docs/decisions.md` as competing options
2. **Reference principles:** Ground in `Vision.txt` design principles or `CLAUDE.md` invariants
3. **User decides:** Surface to user with clear trade-offs
4. **Document outcome:** Update `docs/decisions.md` with chosen path and rationale

---

## Quality Gates

Before any work is "done":

| Gate | Owner | Tool |
|------|-------|------|
| TypeScript clean | Claude Code | `npx tsc --noEmit` |
| Tests green | Claude Code | `npx vitest run` |
| No new lint errors | Claude Code | `npx biome check src` |
| Edge cases covered | Both | Plan file checklist |
| Design invariants preserved | Hermes | Manual review |
| Documentation updated | Hermes | `docs/session.md` |
| Commits clean | Claude Code | `git log` |
| Memory updated | Hermes | `memory` tool |

---

## Example Workflow

### Scenario: Add new feature "Allocation Pie Chart Report"

**Hermes (Planning):**
1. Reads `PROPOSAL.md §1.5` (G11 requirement)
2. Writes `docs/plans/allocation-pie-chart.md` with:
   - User story: "As a household, I want to see spending allocation by category so I understand where money goes"
   - Acceptance criteria (Gherkin)
   - Story points (Fibonacci): 5
   - MoSCoW: Must
   - Deep-review findings (edge cases, data model)
   - DoD checklist
3. Updates `docs/session.md`: "Ready for Claude Code. Plan: docs/plans/allocation-pie-chart.md"

**Claude Code (Implementation):**
1. Reads `docs/session.md`, `docs/plans/allocation-pie-chart.md`, `docs/coding-standards.md`
2. Implements `src/features/report/AllocationPieChart.tsx`
3. Writes tests: `src/features/report/AllocationPieChart.test.ts`
4. Updates i18n: `src/i18n/types.ts`, `en.ts`, `id.ts`
5. Runs: `npx tsc --noEmit && npx vitest run && npx biome check src`
6. Commits: `feat(report): add allocation pie chart`
7. Updates `docs/session.md`: "Ready for Hermes. All gates pass."

**Hermes (Review):**
1. Reads `docs/session.md`
2. Reviews code, tests, commits
3. Opens browser, verifies UI matches design principles
4. Updates `docs/decisions.md` (if new ADR)
5. Updates `docs/project-health.md` (if scores changed)
6. Updates memory if durable pattern learned
7. Syncs to Obsidian workspace

---

## Tools & Integration

- **Hermes:** Memory tool, skills, session_search, delegate_task, terminal, read_file, write_file, patch
- **Claude Code:** Terminal, read_file, write_file, patch, git, npm scripts
- **Shared:** `docs/` folder, git repository, Obsidian vault (via filesystem)

---

## When to Hand Off

**Hand off to Claude Code when:**
- Plan is clear and written
- Acceptance criteria are defined
- Edge cases are enumerated
- Test strategy is specified
- DoD is clear

**Hand off to Hermes when:**
- Code is implemented
- Tests pass
- Commits are clean
- Documentation needs updating
- Architectural decision needs to be made
- Review is needed

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-27 | 1.0 | Initial workflow documentation |
