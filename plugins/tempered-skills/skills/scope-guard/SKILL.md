---
name: scope-guard
description: >
  Catch coding scope creep: pin the stated goal of a coding task, then flag any work that
  is not needed to ship that goal (unrequested features, refactors, abstractions, renames,
  dependency bumps, "while we're at it" changes, edits to unrelated files). Use this skill
  whenever a coding task starts, a plan or diff is drafted, a change set grows past what was
  asked, or the user says "while you're in there", "might as well", "quick cleanup", "also
  fix", "let's just refactor", or "can you also". Asks once, briefly; never blocks; stays
  silent when the work is on track. Not for rollout reversibility (increment-guardian) or
  branch mechanics (gitops-guardian).
---

# Scope Guard — Goal-Pinned Change Discipline

The core thesis: **the goal the user stated is the contract; every edit must trace back to
it.** Work that does not ship the goal is a separate task, offered, not done.

## Rules

### R1 — Pin the goal before the first edit
At the start of a coding task, write the goal in one line, plus what "done" means:
```
GOAL: <one line, in the user's words>
DONE WHEN: <observable result: test passes, page renders, bug no longer reproduces>
IN SCOPE: <files/areas the goal needs>
```
If the goal is unclear, ask once before editing. Keep the pin visible in plans and
summaries. A new user message that changes the goal re-pins it; a passing thought does not.

### R2 — Trace every change to the goal
Before each edit, and when reviewing the diff, every hunk must answer "needed for GOAL?"
Needed includes: callers, tests, fixtures, types and config that the change breaks, and
the fix for a bug that blocks the goal. Not needed (flag it):
- a feature, option, flag or setting nobody asked for
- a refactor, rename, reformat or move of code the goal does not touch
- a new abstraction, wrapper, helper or layer "for later"
- a dependency added or bumped without a direct need
- an edit to a file outside IN SCOPE with no traced reason

### R3 — Ask once, briefly; never block
When R2 flags work, do not do it. Name it in one line and offer it as a follow-up:
```
SCOPE: <the extra work> is not needed for <GOAL>. Skip it, or add it as a follow-up?
```
Ask at most once per item. If the user says do it, do it and widen IN SCOPE. If the user
says no or does not answer, skip it and list it under follow-ups. Batch several flags into
one line. Do not stop the main work to wait for the answer.

### R4 — Silent when on track
If every change traces to the goal, say nothing about scope. No "staying in scope" notes,
no praise, no recap. The skill speaks only when it flags something.

### R5 — Close with the ledger
End the task summary with:
```
GOAL: <pinned goal> — shipped | not shipped
OUT OF SCOPE (not done): <each skipped item, one line> | none
```

## Never flag (these are part of the goal)
Validation at trust boundaries, error handling that prevents data loss, security fixes in
code you touch, accessibility, and anything the user asked for. Cutting these to stay small
is a defect, not discipline.

## Verification (run/inspect; do not assert)
- `git diff --stat` against the base: every changed file is in IN SCOPE or has a traced reason.
- Read each hunk of `git diff`: no hunk is pure reformat, rename or move outside the goal.
- `git diff <base> -- package.json` (or the lockfile for the stack): any new or bumped
  dependency names the goal it serves.
- The ledger in R5 lists every item R3 flagged and the user did not approve.

## Anti-patterns
- **Drive-by cleanup** — fixing lint, names or formatting in nearby code "while here".
- **Speculative generality** — a config option or interface for a second use that does not exist.
- **Nagging** — asking again about an item the user already answered, or flagging needed work.
- **Silent expansion** — doing the extra work and mentioning it only in the summary.
