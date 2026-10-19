---
name: supabase-guardian
description: >
  Enforce database-layer stabilization invariants on any Supabase work: migrations, new
  tables, RLS policies, RPCs, mutations, triggers, or Edge Functions. Use this skill
  whenever the user writes or reviews a Supabase migration, creates a table, adds an RPC
  or database function, wires a client mutation, handles auth/service keys, or asks "is
  this schema change safe." Trigger even on casual phrasing like "add a table for X",
  "write the migration", "let the client update Y", or "quick schema tweak" — the smaller
  the change sounds, the more this checklist matters. Not for git/deploy pipeline questions
  (use gitops-guardian).
---

# Supabase Guardian — Database-Layer Invariants

Every rule below is field-proven (pattern IDs P1–P6 from the operator's stabilization
library). Apply them as gates, not suggestions: work that violates a rule is flagged and
corrected before it ships.

## Rules

### R1 — RPC-only mutations (P1)
All state changes go through a `SECURITY DEFINER` function with `SET search_path = public`.
Client-side INSERT/UPDATE/DELETE is blocked at RLS — no mutation policies for clients, ever.
SELECT policies are scoped to owner/participant. If a request asks for a direct client
write, redesign it as an RPC before proceeding.

### R2 — Idempotency at the RPC boundary (P2)
Every state-changing RPC takes a client-supplied `request_id uuid` and checks it against a
TTL'd `rpc_idempotency` table before executing; the result is cached under that id on
success. Double-fired buttons and flaky networks must be no-ops.

### R3 — Shared guard helpers, never inlined (P3)
Any check needed by two or more RPCs is extracted into one SQL helper function
(`STABLE`, `SECURITY DEFINER`, `SET search_path`). One function, no drift. If you find
yourself copying a WHERE-clause between RPCs, stop and extract.

### R4 — Migration hygiene (P4)
A new table's migration ships the table, its RLS enablement + policies, and the partial
indexes for its hot queries **in the same file**. Migrations are small and phased —
never a schema big-bang. Every migration is a numbered file in the repo; the Dashboard
SQL editor is not a migration path.

### R5 — Snapshot over live join; outbox for time (P5)
Display data that must not retroactively change is snapshotted into JSONB at write time,
not live-joined. All time-based transitions (expiry, reminders, delayed state flips) go
through an outbox/worker (e.g., Inngest) with an idempotency key per unit of work —
never a cron that mutates directly.

### R6 — Secret posture (P6)
The service-role key exists server-side only. Test auth uses admin-API seeding
(`auth.admin.createUser`) persisted to `storageState`; auth state directories are
gitignored. Any diff placing the service-role key in client-reachable code is a hard stop.

## Verification (run these; do not assert)

| Rule | Proof command |
|------|---------------|
| R1 RLS on | `SELECT relname, relrowsecurity FROM pg_class WHERE relname = '<table>';` — expect `t` |
| R1 no client mutation policies | `SELECT polname, polcmd FROM pg_policy WHERE polrelid = '<table>'::regclass;` — expect no INSERT/UPDATE/DELETE rows |
| R1 definer + search_path | `SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname = '<rpc>';` — expect `t` and `search_path=public` |
| R2 idempotency | Call the RPC twice with the same `request_id`; second call returns the cached result, and `SELECT count(*)` on the mutated table shows one row |
| R4 migration list | `supabase migration list` (or `list_migrations`) — new change appears as a file, not as drift |
| R4 hot index | `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<table>';` — partial predicate present for the hot query |
| R6 key leakage | `grep -rn "service_role\|SUPABASE_SERVICE" app/ src/ --include="*.ts*"` — zero hits outside server-only modules |

## Done ledger (P11 discipline)
Conclude any Supabase change with a ✅/⚠️ ledger: each ✅ names the proof command above
that was actually run; each ⚠️ names a residual risk (e.g., "cross-table RLS not yet
load-tested"). A ✅ without a run command is a violation of this skill.
