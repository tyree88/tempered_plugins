---
name: stack-guardian
description: >
  Front door for the stack-guardian family — routes any Vercel + GitHub + Supabase work to
  the right enforcement skill and holds the shared pattern library (P1–P13). Use this skill
  whenever work touches the Vercel/GitHub/Supabase stack and it's unclear which guardian
  applies, when a task spans layers (e.g., a feature with a schema change, a branch, and a
  deploy), when the user asks "what's the right way to do this on our stack", or at the
  start of any significant feature build on this stack. Trigger even on broad phrasing
  like "help me ship this feature" or "set up this project properly".
---

# Stack Guardian — Router

One thesis unifies the family: **the deployed URL and the database are truth; every
mutation is gated and idempotent; every increment is reversible; every "done" is
falsifiable.** The pattern library (P1–P13) lives in `references/invariants.md` — read it
when a guardian cites a P-number you need in full.

## Routing table

| Work touches... | Route to |
|---|---|
| Migrations, tables, RLS, RPCs, DB functions, client mutations, secrets/keys | **supabase-guardian** |
| Branches, PRs, CI workflows, Vercel previews/checks, promotion, schema rollout sequencing | **gitops-guardian** |
| Roadmaps, tech adoption, rewrites, feature rollout strategy, spikes | **increment-guardian** |
| Completion claims, closing issues, status reports, "is it actually done" | **reality-check** |
| Full tracker-vs-reality sweep across sources | **state-sync** (existing skill; not part of this family) |

## Multi-layer tasks
A feature build typically walks all four in order: **increment-guardian** (plan the
reversible sequence) → **gitops-guardian** (cut the paired branch) → **supabase-guardian**
(the schema/RPC work) → **reality-check** (the done ledger before merge). Load each at its
phase; do not front-load all four.

## Shared discipline (applies regardless of route)
- Every rule a guardian enforces cites a P-number; the authoritative text is in
  `references/invariants.md` — guardians never redefine it.
- Every guardian ends work with the P11 done ledger: ✅ entries name the exact command
  run; unverified claims are ⚠️ by definition.
