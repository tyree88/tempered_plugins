---
name: gitops-guardian
description: >
  Enforce the branching and deployment pipeline design for a Vercel + GitHub + Supabase
  stack: trunk-based three-layer branching (git + Vercel preview + Supabase branch),
  forward-only expand→contract migrations, and E2E-gated promotion to production. Use this
  skill whenever the user creates or reviews a branch or PR, sets up CI/GitHub Actions,
  configures Vercel previews or deployment checks, plans a schema change's rollout,
  mentions merging/promoting/shipping to production, or asks "how should I branch this" /
  "is this safe to merge". Trigger even on casual phrasing like "cut a branch", "set up
  the pipeline", or "just push it". Not for the SQL content of migrations (use
  supabase-guardian).
---

# GitOps Guardian — Branching & Promotion Invariants

Pattern IDs P7, P8, P12, P13 from the operator's stabilization library. The core thesis:
**a git branch is only real if all the layers it touches branch with it, and production
is only reachable through a gate that can fail.**

## The branching model: trunk-based, three-layer paired (P12)

- Short-lived `feat/<slug>` branches off `main`, one concern per branch, target lifetime
  ≤ 5 days (configurable). `main` is always deployable.
- **Decision table — change type → required branch layers:**

| Change type | Git branch | Vercel preview | Supabase branch |
|---|---|---|---|
| Code-only (UI, server logic, no schema) | ✔ | ✔ (automatic on push) | — |
| Schema-touching (migration file in diff) | ✔ | ✔ | ✔ (required) |
| Config/env change affecting DB access | ✔ | ✔ | ✔ (required) |
| Docs/content only | ✔ | ✔ (harmless) | — |

- When a Supabase branch is required, its DB URL is injected into the Vercel preview
  environment so the preview exercises the branched schema, seeded via admin-API (P6)
  so E2E tests real RLS.
- **Teardown on merge:** merging the PR deletes the git branch and the Supabase branch.
  Orphaned layers are drift.
- **Stall signal:** a branch older than the lifetime threshold is surfaced as a finish-or-
  kill decision, not silently tolerated. Branches are workspaces for finishing, not parking.

## Migrations: forward-only, expand→contract (P13)

Schema changes ride the branch as migration files, are proven on the Supabase branch, and
reach production **only** via the merge path (`merge_branch` / CI replay). Hand-applying
in the Dashboard is a named anti-pattern — it creates the schema drift the reconciliation
layer exists to catch.

Destructive changes split across two PRs so `main` stays deployable throughout:

**Worked example — renaming `events.start_time` → `events.starts_at`:**
1. **PR 1 (expand):** migration adds `starts_at`, backfills from `start_time`, adds a
   sync trigger; code reads `starts_at` with fallback, writes both. *`main` deployable:
   old and new code both work against this schema.*
2. **(migrate):** deploy; confirm zero reads of `start_time` via logs/queries.
3. **PR 2 (contract):** migration drops the trigger and `start_time`; code drops the
   fallback. *`main` deployable: only new column referenced anywhere.*
Rollback at any point = revert the PR (P9 posture). A single-PR rename is a violation.

## Promotion pipeline (P7)

- Vercel auto-deploys a preview on every push — free signal, never disabled.
- E2E (Playwright) triggers on the GitHub `deployment_status` event, gated on
  `state == 'success'`, with the preview URL passed as `BASE_URL`. If previews are
  protected, enable **Protection Bypass for Automation** and send the
  `x-vercel-protection-bypass` header — otherwise tests silently hit an auth wall.
- **Vercel Deployment Checks gate production promotion** — E2E must block the promote,
  not merely react after it. CI retries = 2; HTML report + trace uploaded `if: always()`.

## Sandbox boundary (P8)

Anything long-running, GPU-bound, or cache-sensitive (asset bakes, heavy codegen) runs in
an external containerized worker, not Vercel's build. Its output enters the repo through a
CI gate with a measurable threshold (size budget, validation report) — never hand-copied.

## Anti-patterns (named explicitly)
- Long-lived feature branches; "integration" branches between feature and main.
- Dashboard schema edits; migrations "tested locally" but never run on a Supabase branch.
- Merging a schema PR whose diff lacks a migration file.
- E2E that runs on `push` against localhost while previews go untested.
- Disabling deployment protection instead of using the bypass header.

## Verification (run these; do not assert)

| Claim | Proof command |
|------|---------------|
| Supabase branch paired | `supabase branches list` (or MCP `list_branches`) — branch matching the PR exists |
| Preview exists | GitHub PR checks show the Vercel preview URL; `curl -I <preview-url>` with bypass header returns 200 |
| Migration rides the PR | `git diff main...HEAD --name-only \| grep supabase/migrations/` — non-empty for schema changes |
| E2E gates promotion | `.github/workflows/*.yml` contains `deployment_status` trigger; Vercel project has the check registered as blocking |
| Teardown complete | After merge: branch absent from `git branch -r` and from `supabase branches list` |
| No schema drift | `supabase db diff --linked` returns empty against production |

## Done ledger (P11 discipline)
Every merge concludes with a ✅/⚠️ ledger citing the proof commands actually run.
