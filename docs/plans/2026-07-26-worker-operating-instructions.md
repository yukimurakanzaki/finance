# Worker Operating Instructions

**For:** Hermes worker agents on `minimax-m3`, working in `yukimurakanzaki/finance`
**Companion:** `docs/plans/2026-07-25-sprint-1-builder-brief.md` — *what* to build. This document is *how to work*.

---

## 1. Your scope

You implement **one task at a time**, from the builder brief, and open one pull request per task.

You do not: pick your own tasks, refactor code the task does not name, apply database migrations, deploy anything, or edit the system prompt.

If you finish a task and see obvious adjacent work, **write it in the PR description**. Do not do it.

---

## 2. Read order, before writing any code

1. This document.
2. `docs/plans/2026-07-25-sprint-1-builder-brief.md` — §0 ground rules, then your task.
3. The plan sections your task names — `docs/plans/2026-07-25-ai-manager-ux-requirements.md`.
4. The actual source files the task names. **Read them; do not infer their contents from the task description.** Three tickets in this project were written by people who described code they had not read, and all three were wrong.

---

## 3. Environment

Windows. Both PowerShell and a bash shell are available; each takes its own syntax. Node and npm are installed.

```bash
npx tsc --noEmit     # typecheck
npx vitest run       # full suite
npx vitest run <path> # single file, while iterating
```

Do not start a dev server. Nothing in Sprint 1 requires one, and no task is verified by looking at a page.

`npm run lint` runs biome. **It is not the gate** and may report pre-existing issues unrelated to your change. Do not fix unrelated lint findings; do not let them block you.

---

## 4. Workflow, per task

```
git checkout main
git pull                              # main must be current before you branch
git checkout -b sprint1/<task-id>     # e.g. sprint1/t3-overdraft-split
  ... implement ...
  ... write the acceptance test from the brief ...
npx tsc --noEmit && npx vitest run    # both must pass
git add <only the files you changed>
git commit
git push -u origin sprint1/<task-id>
gh pr create --base main
```

**Branch from current `main` every time.** Do not branch from another task's branch — tasks are independent by design, and stacking them makes review impossible.

**`git add` named paths, never `git add -A`.** This repository has untracked tooling output (`.hermes/`, `graphify-out/`, `supabase/.temp/`) that must never be committed.

---

## 5. The gate

A task is done when **all** of these hold. Not four of five.

- [ ] `npx tsc --noEmit` — no errors
- [ ] `npx vitest run` — **≥ 545 passing, 0 failing**
- [ ] The acceptance test named in the brief exists and passes
- [ ] No new dependency in `package.json`
- [ ] No change to `PERSONA` or `PROMPT_VERSION` in `src/ai/context.ts`
- [ ] Only files your task names are modified

545 is the floor as of `3e547ae`. If the count drops, you broke something — find it, do not explain it away.

**Never report a task complete without running both commands in that same session.** Paste the real output. "Tests should pass" is not a result.

---

## 6. Reporting format

End every task with exactly this:

```
TASK: <id>
BRANCH: sprint1/<task-id>
PR: <url>

CHANGED:
  <path> — <one line: what and why>

VERIFICATION:
  tsc:    <paste actual output>
  vitest: <paste actual output>

ASSUMPTIONS:
  <anything you decided that the brief did not specify — or "none">

NOT DONE:
  <anything in the task you could not complete, and why — or "nothing">
```

`ASSUMPTIONS` and `NOT DONE` are the two most useful fields. An empty `NOT DONE` on a task you partially finished is worse than the partial work.

---

## 7. Stop and ask — do not guess

Stop, report, and wait when:

- A requirement seems to need a formula subtracting recurring items from `allowance.monthly_amount`. **Re-read correction C-1 first.** This is the single most repeated error in this project's history.
- A requirement seems to need the system prompt.
- A requirement seems to need a new dependency, a router, or push notifications.
- Two different ways to compute the same number exist. Pick the one in `src/engine/**`, and say you did.
- The task text contradicts the code. **The code wins.** Report the contradiction; do not silently follow either one.
- A test fails and you do not understand why. Do not delete it, do not weaken its assertion, do not add `.skip`.

**Guessing is the failure mode this document exists to prevent.** A stopped task with a clear question costs an hour. A confidently wrong money formula ships to a household's dashboard.

---

## 8. Hard prohibitions

- **Never apply a database migration.** Write the `.sql` file; a human applies it. Migration files are named `<version>_<name>.sql` and the version must match what the database records — never invent one.
- **Never deploy** the Supabase edge function or the app.
- **Never run `git push --force`**, `git reset --hard` on a branch you did not create, or `git stash drop`. A stash in this repository currently holds the only copy of unrecovered work.
- **Never weaken a test to make it pass.**
- **Never invent a number.** If a value is unknown, render `—`, return `unknown`, or ask. Do not substitute a plausible figure.
- **Never commit** `.hermes/`, `graphify-out/`, `.cline/`, `supabase/.temp/`, or `node_modules/`.

---

## 9. Working with money code

This is a personal-finance app. Money bugs are not cosmetic — a wrong number on a dashboard changes what a household does with its salary.

- Amounts are **whole rupiah integers**. No floats, no decimals, no negatives where a magnitude is meant.
- Format with `formatRpFull` / `toLocaleString('id-ID')`. Never hand-roll separators.
- Any new branch, loop, or arithmetic touching money gets a test. Not a suite — one test that fails if the logic breaks.
- If you change what a number means, say so explicitly in the PR. Silent redefinition is the worst outcome available to you.

---

## 10. Definition of a good PR

Title names the task. Body states: what changed, which acceptance test proves it, the verification output, and anything you assumed.

Small is correct. If your diff touches files the task did not name, you did too much — split it or explain why in the body.
