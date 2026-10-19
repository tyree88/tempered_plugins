---
name: reality-check
description: >
  Enforce the falsification layer on completion claims: every "done" is a claim to verify
  against live systems (deployed Vercel URL, Supabase schema/data, main branch), and every
  piece of work concludes with a verifiable done-ledger. Use this skill whenever the user
  or an agent claims something is done/fixed/shipped/working, before closing an issue or
  ticket, when a status report is drafted, or when the user asks "did that actually work" /
  "is this really done" / "audit this claim". Trigger even on casual phrasing like "looks
  done to me", "ship it", or "close the ticket". For full multi-source tracker
  reconciliation, this skill delegates to the state-sync skill rather than reimplementing it.
---

# Reality Check — Falsification Invariants

Pattern IDs P10 and P11. The core thesis: **trackers and claims are hypotheses; the
deployed URL and the database are the experiment.** The agent's own assertion is never
evidence.

## Rules

### R1 — Read-first, query-before-mutate (P10)
Before acting on any stated system state ("the migration ran", "the flag is on", "the
issue is stale"), read the live system first: query the database, fetch the deployed URL,
inspect the actual branch. Only mutate trackers/state after the read confirms the premise.

### R2 — Evidence classes (P10)
A completion claim is verified only by one of:
- a **live-system read** (SQL query result, HTTP response from the deployed URL, CI run link),
- a **merged PR** whose diff contains the change,
- a **reproduced behavior** observed in a preview or production environment.
Screenshots of local dev, agent assertions, and tracker status fields are not evidence.

### R3 — Mechanical vs judgment split (P10)
Only mechanical, evidence-backed corrections auto-apply (e.g., closing an issue whose
linked PR is verifiably merged). Anything requiring interpretation is staged for the human
with the evidence attached — never silently decided.

### R4 — The done ledger (P11)
All substantive work concludes with:
```
✅ <claim> — verified by <exact command/query/URL actually run>
✅ <claim> — verified by <...>
⚠️ <residual risk or unverified assumption, named plainly>
```
A ✅ whose verification is "confirmed" or "tested" with no command named is reclassified
as ⚠️ on sight.

### R5 — Delegation to state-sync
For multi-source reconciliation (Notion + GitHub issues vs Vercel + Supabase + live code),
invoke the **state-sync** skill — it owns config, sources, and write policy. This skill
carries no config-reading logic of its own; it is the per-claim discipline, state-sync is
the per-project sweep.

## Verification patterns (the falsification toolbox)
- Deployed behavior: `curl -s <production-or-preview-url>/<route>` and inspect the actual response.
- Schema claims: `supabase db diff --linked` (empty = no drift) or a targeted `pg_catalog` query.
- "The PR fixed it": `git log --oneline main | grep <sha>` + re-run the failing case.
- "The job ran": the worker/CI run URL with a green status, not the schedule definition.

## Done ledger
This skill eats its own cooking: applying it to a claim ends with the ledger in R4.
