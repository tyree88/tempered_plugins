# Stack Guardian Pattern Library (P1–P13)

Single source of truth. Guardians cite P-numbers; this file defines them. Each pattern is
field-proven from real project work (an invite system, a 3D asset pipeline,
browser-testing research, state-sync family), not doc folklore.

## Database layer (enforced by supabase-guardian)
- **P1 — RPC-only mutations.** All state changes via `SECURITY DEFINER` RPC with
  `SET search_path = public`; RLS blocks client INSERT/UPDATE/DELETE entirely; SELECT
  scoped to owner/participant.
- **P2 — Idempotency boundary.** Client-supplied `request_id` UUID checked against a
  TTL'd `rpc_idempotency` table on every state-changing RPC; result cached under the id.
- **P3 — Shared guard helpers.** Any check needed by ≥2 RPCs is extracted to one SQL
  helper function. One function, no drift.
- **P4 — Migration hygiene.** Table + RLS + partial indexes for the hot query ship in the
  same migration file. Small, phased migrations; never a schema big-bang; Dashboard SQL
  editor is not a migration path.
- **P5 — Snapshot over live join.** JSONB snapshots at write time for display data that
  must not retroactively change; outbox + worker (idempotency-keyed) for all time-based
  transitions.
- **P6 — Secret posture.** Service-role key server-only, ever. Test auth via admin-API
  seeding into `storageState`; auth dirs gitignored.

## Pipeline layer (enforced by gitops-guardian)
- **P7 — Gated promotion.** Auto-deploy previews on push; Playwright E2E on
  `deployment_status` against the preview URL with the Protection Bypass header; Vercel
  Deployment Checks block production promotion.
- **P8 — Sandbox boundary.** Long-running / GPU / cache-sensitive work runs in an external
  containerized worker, not Vercel's build; output enters via a CI gate with a measurable
  threshold.
- **P12 — Three-layer branch pairing.** Trunk-based, short-lived `feat/<slug>` branches
  off `main`. A branch is only real if all layers it touches branch together: git +
  Vercel preview + Supabase branch when schema is touched (branch DB URL injected into
  preview env, admin-API seeded). Merge tears down all layers. Branch age past threshold
  is a finish-or-kill signal.
- **P13 — Forward-only, expand→contract migrations.** Migration files ride the branch,
  proven on the Supabase branch, reach production only via the merge path. Destructive
  changes split expand → migrate → contract across separate PRs; `main` deployable at
  every intermediate state; rollback = revert.

## Increment layer (enforced by increment-guardian)
- **P9 — Reversible increments.** Every commit shippable; unproven tech behind spikes
  with explicit timebox, pass criterion, and kill criterion; new capability defaults OFF
  behind a working fallback; rewrites require a written, rejected incremental alternative.

## Falsification layer (enforced by reality-check)
- **P10 — Read-first reconciliation.** Trackers and claims are hypotheses; live systems
  (deployed URL, Supabase schema/data, main branch) are truth. Read before mutating.
  Only mechanical, evidence-backed corrections auto-apply; judgment calls staged for a
  human with evidence attached.
- **P11 — Falsifiable done.** Work concludes with a ✅/⚠️ ledger; every ✅ names the exact
  command/query/URL run to verify it; a ✅ without a named verification is a ⚠️.
