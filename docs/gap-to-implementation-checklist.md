# Gap-to-Implementation Checklist

**Goal:** close remaining gaps for the 4-step user journey:
1. view safe-to-spend today
2. set income
3. set recurring bills with due/end dates
4. set pots / allowance

---

## P0 — Must-have before calling journey complete

### 1) Make recurring end date meaningful
- [ ] Use `end_date` in recurring-item active logic
- [ ] Exclude ended items from safe-to-spend / projections automatically
- [ ] Show ended state in UI
- [ ] Add test for ended recurring item handling

**Why:** debt payoff date exists in UI, but system behavior still ignores it.

### 2) Add real tests for CRUD + autofill
- [ ] Test account edit autofill
- [ ] Test asset edit autofill
- [ ] Test recurring edit autofill
- [ ] Test income edit autofill
- [ ] Test update/delete paths for income and recurring items

**Why:** current coverage is ad-hoc only; regressions are likely.

### 3) Add one guided setup entrypoint
- [ ] Create a setup/checklist screen or wizard
- [ ] Guide user through income → recurring bills → pots/allowance
- [ ] Link from safe-to-spend empty state

**Why:** user journey is still split across screens and discoverability is weak.

---

## P1 — Should-have for trust and clarity

### 4) Give `next_due` a visible purpose
- [ ] Show next due date in recurring list
- [ ] Mark overdue items
- [ ] Optionally surface reminders or prompts

**Why:** due date is stored but not yet useful to user.

### 5) Add income / recurring completeness signals
- [ ] Show last income entry date
- [ ] Show active recurring count
- [ ] Show missing setup prompt when no income or no recurring items exist

**Why:** improves confidence that the number is current.

### 6) Add pots / allowance lifecycle clarity
- [ ] Clarify weekday/weekend pot behavior in UI
- [ ] Show current allowance breakdown
- [ ] Consider separate presets if weekday/weekend needs independent editing

**Why:** current allowance editor is enough for a single value, but not yet a full pot workflow.

---

## P2 — Nice-to-have after core flow is stable

### 7) Improve reminder / planning UX
- [ ] Surface recurring bills on Spend screen when due soon
- [ ] Add a lightweight overdue badge
- [ ] Consider notification hooks later

### 8) Improve auditability
- [ ] Add change history for manual balance overrides
- [ ] Add change history for income and recurring edits

---

## P3 — Future nice-to-have

### 9) Expand reporting
- [ ] Use recurring end dates in monthly forecast
- [ ] Show debt payoff progress
- [ ] Show cashflow impact of income changes

### 10) Polish and resilience
- [ ] Add empty-state CTAs for every main surface
- [ ] Add more browser-based QA for the journey
- [ ] Add stronger validation for numeric/date inputs

---

## Recommended Execution Order

1. recurring end date behavior
2. CRUD + autofill tests
3. guided setup entrypoint
4. next due visibility / overdue state
5. allowance / pots clarity
6. auditability and reporting polish

---

## Done Criteria

- Safe-to-spend still works
- Income CRUD works
- Recurring CRUD works
- Edit forms autofill correctly
- End dates affect system behavior
- User can complete setup without guessing where to go next
