---
name: increment-guardian
description: >
  Enforce reversible-increment discipline on planning and build work: shippable at every
  commit, risky tech behind spikes with kill criteria, new capability defaulting OFF behind
  a fallback. Use this skill whenever the user plans a feature rollout, proposes adopting a
  new library/runtime/technology, drafts a roadmap or implementation plan, suggests a
  rewrite or refactor, or asks "should we switch to X" / "how do we roll this out".
  Trigger even on casual phrasing like "let's just rebuild it", "migrate everything to X",
  or "big refactor". Not for branch mechanics (gitops-guardian) or DB rules
  (supabase-guardian).
---

# Increment Guardian — Reversibility Invariants

Pattern ID P9. The core thesis: **every commit is shippable, every bet is a spike with a
kill criterion, and every new capability defaults off behind a working fallback** — the
generalized WebGL2-default / WebGPU-behind-spikes posture.

## Rules

### R1 — Shippable at every commit
No plan may contain a phase during which `main` cannot deploy. If a step breaks
deployability, split it (see gitops-guardian's expand→contract) or gate it behind a flag.
"We'll fix it before merging" is not a state; it's a violation.

### R2 — Spikes carry kill criteria
Any adoption of unproven tech (new renderer, new runtime, new service) is framed as a
spike **before** integration work begins, with:
- a time box,
- a pass criterion that is measurable (a number, a working demo under stated constraints),
- a **kill criterion** — the observation that ends the bet, written down in advance.
A spike without a kill criterion is a commitment in disguise; rewrite it.

**Spike template:**
```
SPIKE: <one line>
TIMEBOX: <days>
PASS: <measurable outcome>
KILL: <observation that terminates the bet>
FALLBACK: <what ships if killed — must already work>
```

### R3 — New capability defaults OFF
The proven path remains the shipping default; the new path is promoted only after its
spike clears and it has run behind a flag/tier gate in production-like conditions.
Promotion is a deliberate diff, never a side effect.

### R4 — Rewrite pressure test
When a rewrite or greenfield rebuild is proposed, require the incremental alternative to
be stated and rejected **in writing** first: what sequence of reversible steps reaches the
same end state, and why is it worse? If no such sequence is articulated, the rewrite does
not proceed. (This encodes the operator's concentration-and-finishing principle at the
plan level.)

## Verification (run/inspect; do not assert)
- Plan review: every phase names its deploy state; grep the plan for phases lacking a
  "main deployable: yes" note.
- Spike review: every unproven-tech item matches the template above — PASS and KILL both
  present and measurable.
- Flag check: new capability's default value in code/config is the fallback path;
  confirmed by reading the flag definition, not the PR description.
- Rewrite check: the written incremental-alternative comparison exists in the plan/PR.

## Done ledger (P11 discipline)
Plans conclude with a ✅/⚠️ ledger; each ✅ cites the inspection performed.
