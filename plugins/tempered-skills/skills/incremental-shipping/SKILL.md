---
name: incremental-shipping
description: Use when you have a backlog of related work (audit findings, multi-part feature spec, bug cluster) and need to ship it in PR-shaped chunks without scope creep. Triggers on phrases like "ship this in chunks", "tier the work", "what's next after this commits", "complete this end-to-end", "two PRs are easier to review than one", "let's go in waves", or any time the working tree has 10+ uncommitted files spanning multiple themes. Not for one-shot single-file edits or pure exploration tasks.
type: rigid (the discipline is the value)
---

# Incremental Shipping — the conductor skill

Encodes the **outer loop** that takes a backlog from "user asks for X" to "X is shipped, reviewed, and the team knows what's next" in reviewable PR-shaped chunks.

This is a meta-workflow. It composes other skills rather than replacing them. Reach for `writing-plans`, `executing-plans`, `verification-before-completion`, `systematic-debugging`, and `finishing-a-development-branch` as the phases unfold.

## Step 0 — Ask the user: rigid or flexible?

**MANDATORY first action when invoking this skill.** Before touching code, ask:

> This skill runs in two modes. Which one?
>
> - **Rigid** — Never skip a phase. CONFIRM (build + smoke test + diff against ask) is mandatory before UPDATE. Every commit gets a multi-paragraph body. Tier boundaries are enforced (no mixing themes in one commit). Best for: handoffs, audit work, anything that needs to be defensible at review.
>
> - **Flexible** — Same 5 phases but you can collapse CONFIRM into TEST when the change is trivially safe (CSS tweak, copy fix, dead-code deletion). Commit bodies can be one line if the change is self-explanatory. Best for: exploratory work, prototyping, when you trust the reviewer to ask follow-ups.

Wait for the answer. If unclear or the user defers, default to **rigid** — the failure mode of flexible is silent scope creep, which is the exact thing this skill exists to prevent.

The phase shape is identical in both modes. Mode only affects how strict the verification + commit-body discipline is.

## The Loop

```
DESIGN → TEST → CONFIRM → UPDATE → COMPLETE → next chunk
   ↑                          │
   └─── (drift detected) ─────┘
```

You don't skip phases. You loop back when drift is detected.

## Phase 1 — DESIGN

Read first, edit second. Always.

- **Map current state** with file:line refs before proposing changes. Use the project's grep/search tools to find existing patterns rather than introducing new abstractions.
- **Detect drift** between spec and reality as **architectural signal**, not a bug to swat. If the prompt describes a stale state, ask "what's shipped since? what's the implicit architecture question?"
- **Reuse-existing-pattern rule.** Find one already-working example in the codebase before writing new code. Treat your first instinct to "write something better" as a smell — usually the pattern already exists, you just haven't found it yet.
- **For non-trivial work** (>3 files, >100 lines, or any new abstraction), invoke `superpowers:writing-plans` to produce a plan file before touching code.

Mark drift loudly. "I expected X here based on the prompt, but the code shows Y. That's not a bug to fix — that's a question about which one is the source of truth."

## Phase 2 — TEST

Build + live smoke. Not just unit tests.

- **Run the project's build/typecheck command.** Failed build = loop back to DESIGN, don't push past.
- **Run the project's lint command.** Accept the pre-existing baseline as noise; flag only NEW errors introduced by your changes. Don't get distracted fixing unrelated lint.
- **Live smoke test via the appropriate runtime tool.** Examples by surface type:
  - Web UI: chrome-devtools-mcp navigation + console review, OR Playwright via the playwright MCP, OR a manual screenshot the user shares back
  - CLI: run the actual command with realistic input
  - API: hit the endpoint with `curl` or the project's HTTP client
  - Database migration: apply to a branch DB and inspect, never to production
- **Verify SIMILAR surfaces, not just the reported one.** Bugs cluster by pattern, not by location. After fixing one, grep the codebase for the same pattern. If it exists in N other places, the architecture problem is N+1, not 1.

When TEST fails: invoke `superpowers:systematic-debugging` for the diagnosis loop. Don't guess.

## Phase 3 — CONFIRM

Compare result to the original ask. Surface gaps before the user has to ask.

- **Side-by-side diff:** What was asked vs what landed. Tables work well. Be honest about partial deliveries.
- **Name skipped items with reasons:** deferred (with reason) / dead code / out of scope / explicit exception (cite the source — CLAUDE.md, spec, ADR). Never silent.
- **Detect drift again** — between the result and the user's mental model of what they'd get. If their next question would be "what about X?", surface X here.
- If a gap is found that requires another iteration: **loop back to DESIGN.** Don't paper over.

When the implementation matches the ask: invoke `superpowers:verification-before-completion` for the explicit checklist before declaring done. Evidence before assertions.

## Phase 4 — UPDATE

Commit in reviewable units.

- **Stage explicit file lists.** `git add path/to/file` per file. Never `git add .` or `git add -A` — they catch session artifacts, secrets in `.env*`, generated files.
- **Commit message shape:**
  ```
  <type>(<scope>): <summary in imperative, lowercase>

  <paragraph: why this change exists / what problem it solves>

  <paragraph: how the fix works / what pattern it copies>

  <bullet list: file changes grouped by role>

  <Out of scope> section if applicable — name what was deliberately excluded
  <Verification> section: build status + smoke notes + commands run

  Co-Authored-By: <ai assistant identity per project convention>
  ```
- **One commit = one reviewable unit.** Test: read the commit body in 30 seconds — does the reviewer understand the WHY? If you wrote "and also" or "additionally" twice, split into two commits.
- **TaskUpdate as you go.** Mark phases complete as they ship. Don't batch.
- **Never `git commit --amend`** unless the user explicitly asks. Prefer a new commit. Per most projects' git hygiene policies.
- **Never `--no-verify`** to skip hooks. If a hook fails, fix the cause.

## Phase 5 — COMPLETE

Recap + transition.

- **Recap table:** what changed, files modified, build status. Ready-to-paste into a PR description.
- **Branch state:** commits ahead of base, ready-to-push status, any pending decisions.
- **Identify next chunk** (or stop). If you're stopping, name what's still in the backlog and why so the user has the next handle.

For the LAST chunk in a backlog: invoke `superpowers:finishing-a-development-branch` to formalize merge/PR/cleanup options.

## Cross-cutting moves

These are what distinguish this skill from generic "do software well":

### Tier-stack the backlog

When work is multi-themed, stratify by impact and ship in tiers:

- **T1** — High-impact user-facing polish (one PR)
- **T2** — Depth / native-feel additions (one PR)
- **T3** — Cross-cutting hygiene (one PR)
- **T4** — Opportunistic cleanup (rolls into adjacent work, no dedicated sprint)

Each tier is one commit minimum. Never mix tiers in one diff. The user-facing rule: **two PRs are easier to review than a single 28-file diff** — even when the work is technically "all related."

If the backlog is already small (3-5 files), the tier stack collapses to one commit. That's fine — the rule is "don't EXPAND scope," not "force multiple commits."

### Drift-as-signal

When reality differs from expectation, ask "what architectural question is hidden here?" before reaching for a fix.

Three flavors of drift to watch for:

1. **Spec drift** — the prompt describes state that isn't current. (Solution: re-read the code, not the prompt.)
2. **Pattern drift** — a fix exists in 3 places, broken in 17 others. (Solution: grep for the pattern; fix all instances or explicitly defer.)
3. **Mental-model drift** — user's understanding of how the code works ≠ how it actually works. (Solution: surface this in CONFIRM with file:line evidence.)

### Verify similar surfaces

After fixing one bug, grep for the pattern. Don't ship a fix until you know how many places it applies.

### Scope discipline with explicit callouts

Adjacent work mid-flow → fold-with-callout OR defer-with-reason. Never silent.

- **Fold-with-callout:** "While migrating X, I also fixed Y because they share root cause Z. Body of the commit names both." Reviewer can decide if Y deserves a separate PR.
- **Defer-with-reason:** "Found Z, didn't fix because reason." Reason goes in the commit body's "Out of scope" section.
- **"Out of scope" sections** in plan files and commit bodies are mandatory in rigid mode.

### Destructive actions need explicit user confirmation

Per most projects' git hygiene: never `git push --force`, `git reset --hard`, `git rm`, or delete data without user approval.

For dead-code deletion specifically: do the verification first (multiple grep angles + git history check) and present evidence. Then ask. Then act.

## Anti-patterns this skill blocks

| Anti-pattern | Why it's bad | What to do instead |
|---|---|---|
| Single 28-file PR spanning multiple themes | Reviewer can't focus | Tier-stack into 3-4 commits |
| `git add .` or `git add -A` | Includes session artifacts, secrets, generated files | Stage explicit paths |
| Commit body says WHAT, not WHY | Stale immediately; reviewer has no context | Multi-paragraph body explaining the architecture/pattern |
| "Done" claimed before smoke test | Bugs ship | TEST phase is mandatory; evidence before assertions |
| Silent scope creep | "Why is this file in this PR?" at review time | Explicit callout in commit body |
| Edit before read | Misses existing patterns; creates duplicate abstractions | Read first, find one example, copy the pattern |
| Drift treated as bug | Misses the architectural signal | Drift = re-design phase trigger |
| Fixing one surface when N have the same pattern | Ships partial fixes; user re-reports | Grep for the pattern; fix all OR explicitly defer with reason |

## When NOT to use this skill

- **Single-file CSS tweak or copy fix** — overkill. Just do it.
- **Pure exploration / "let's see what's here"** — use `superpowers:brainstorming` or just direct grep.
- **Hot-fix on production where speed > review discipline** — note the trade and document after-the-fact, but don't gate on the loop.
- **Backend-only data migration with no UI surface** — different verification shape (no browser smoke). The phase structure still applies but TEST means schema validation + dry-run, not console review.
- **Single-author pet project where you ARE the reviewer** — flexible mode is acceptable; rigid mode adds ceremony without payoff.

## Composition with other skills

This skill orchestrates:

- `superpowers:writing-plans` — when DESIGN phase needs a plan file
- `superpowers:executing-plans` — when there's already a plan to follow
- `superpowers:brainstorming` — when DESIGN needs ideation before constraints
- `superpowers:systematic-debugging` — when TEST fails and you need a diagnosis loop
- `superpowers:verification-before-completion` — between TEST and CONFIRM
- `superpowers:test-driven-development` — inner loop inside Phase 1+2 for new features
- `superpowers:requesting-code-review` — at end of last chunk if external review wanted
- `superpowers:finishing-a-development-branch` — at COMPLETE on the last chunk
- `superpowers:dispatching-parallel-agents` — when chunks are mutually independent and can ship in parallel

You don't need to invoke them manually — load this skill first, and reach for the others as the phases unfold. This skill is the conductor; those are the players.

## Project overrides

If a project has its own `.claude/skills/incremental-shipping/SKILL.md`, that overrides this one. Project-level versions can:

- Cite specific build/lint commands (e.g., `pnpm build` vs `npm test`)
- Cite specific verification tools (chrome-devtools-mcp, Playwright, project's E2E suite)
- Pin specific commit conventions (Co-Authored-By footer, scope vocabulary, type prefixes)
- Reference project CLAUDE.md rules directly
- Provide "reference commit" examples from the project's git log

The 5-phase loop and the cross-cutting moves stay constant; the project-level version specializes the *how* without changing the *what*.
