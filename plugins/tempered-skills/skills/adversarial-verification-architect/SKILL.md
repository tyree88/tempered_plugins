---
name: adversarial-verification-architect
description: >
  Design a multi-agent verification prompt that proves or breaks claims through separation of
  powers — the agent that produces a finding is never the agent that attacks it, and neither is
  the agent that judges it. Use this skill whenever the user wants an "audit prompt", a
  "production-readiness check", a "QA audit", a "branch audit", a "feature reality matrix",
  a "trigger audit", a "state-of-the-union", or any prompt that must verify completion claims
  against live code, a database, or a deployed system rather than take them at face value.
  Also trigger when the user says "treat every Done as a claim to falsify", "I want adversarial
  QA", "build me a multi-agent audit", "stand up reviewer/breaker/judge agents", or wants a
  prompt where verdicts only survive if an attacker who never saw the verdict cannot break it.
  This is the EVALUATE/AUDIT-side architect. For building a feature via a single execution loop,
  use goal-loop-forge instead.
---

# Adversarial Verification Architect — Separation of Powers for Audits

Build verification prompts where truth is established by structural conflict, not by a single
agent grading its own homework. The producer, the attacker, and the judge are always different
instances, so no finding ships unless it survives an adversary that never saw it coming.

Core philosophy: **a verdict that the same agent produced and approved is a press release.**
Real verification needs an instance whose only job is to break the claim, and a separate
instance whose only job is to rule — neither anchored on the other's output.

The three engines:
- **Pattern Recognition** classifies each verification unit by complexity and assigns the fixed
  role taxonomy, sizing agent effort with complexity banding.
- **Sequential Thinking** runs the nested micro-loop per unit (act -> attack -> judge ->
  reflect -> store) in committed, ordered steps.
- **Learning Loop** drives the contradiction-seeking macro-loop and the convergence conditions
  that decide when the audit is actually done versus merely tired.

---

## When to Use This Skill

- Verifying feature-completion claims against real code and a real database
- Production-readiness / go-live gates across multiple branches or surfaces
- Trigger / side-effect audits (what actually fires on purchase, invite, delete, etc.)
- Any prompt where "Done" labels must be falsified, not trusted
- Multi-source state reconciliation (tracker vs deployed reality)

Do NOT use for: building or implementing a feature (use goal-loop-forge); a quick single-pass
review with no adversarial structure (overkill — a plain checklist will do).

---

## The Role Taxonomy (Separation of Powers)

The non-negotiable mechanism is that **producer, attacker, and judge are never the same
instance.** Instantiate a fixed taxonomy per verification unit rather than inventing unrelated
characters. The canonical seven:

| Archetype | Single Job | Sees |
|-----------|-----------|------|
| **Orchestrator** | Plans units, assigns roles, enforces caps | Global plan only |
| **Cartographer** | Maps the surface — what exists, what to check | Source of record |
| **Tracer** | Produces the finding — follows the claim to ground | The unit under test |
| **Breaker** | Attacks the finding — tries to falsify it | The finding, NOT the verdict |
| **Judge** | Rules pass/fail on finding-vs-attack | Both, neither in advance of the other |
| **Critic** | Runs the PASS checklist against the verdict | The verdict + checklist |
| **Reconciler** | Merges surviving verdicts into the deliverable | All passed verdicts |

**Isolation is the load-bearing property, not a style choice.** The Breaker must not see the
Judge's reasoning, and the Judge must not see the verdict it is about to render pre-justified.
When no real subagent dispatch exists, enforce isolation *by instruction*: explicit role
switches with a hard rule that each role reasons fresh and may not reference another role's
private work.

---

## Workflow

```
1. SURVEY     -> Cartographer enumerates verification units from the source of record.
2. BAND       -> Classify each unit: trivial / standard / complex / cross-cutting.
3. MICRO-LOOP -> Per unit: act -> attack -> judge -> reflect -> store (Reflexion).
4. MACRO-LOOP -> Seek contradictions across units until convergence or cap.
5. RECONCILE  -> Merge surviving verdicts into Ledger / Matrix / Gate / Verdict.
```

---

## Phase 1: Complexity Banding

Effort is allocated by band, not spread evenly. This is the cost control that keeps a
multi-agent audit from exploding.

```
trivial      -> 1 micro-loop pass,  no Breaker escalation unless the finding is surprising
standard     -> 1-2 passes,         full producer/attacker/judge cycle
complex      -> up to [cap] passes,  Breaker gets a second attack angle
cross-cutting-> spans units;          Orchestrator tracks it as its own unit with its own gate
```

**Budget guard:** when the budget is tight, the Orchestrator down-bands *visibly* — it states
"unit X down-banded from complex to standard due to budget" rather than silently faking
coverage. A shrunk audit that says so is honest; a shrunk audit that pretends is the failure.

---

## Phase 2: The Reflexion Micro-Loop (per unit)

Each verification unit runs a nested cycle. The order is committed and the roles are isolated.

```
ACT      (Tracer)  -> produce the finding: trace the claim to code/DB evidence
ATTACK   (Breaker) -> try to falsify the finding; never sees the eventual verdict
JUDGE    (Judge)   -> rule PASS/FAIL on finding-vs-attack
REFLECT  (Critic)  -> run the PASS checklist; capture why it passed or failed
STORE              -> write the verdict + evidence to the unit ledger
```

The micro-loop iterates (up to the band cap) only while the Judge returns FAIL or the Critic's
checklist flags a hole. It exits on a clean PASS that survived a real attack.

---

## Phase 3: The PASS Checklist (Critic's gate)

Repurpose the source prompt's self-check questions as the Critic's checklist, and add the
adversarial sixth:

```
A verdict PASSES only if:
  1. The finding is grounded in named evidence (file:line, query result, live run)
  2. No STANDARDS / invariant is violated
  3. The claim and the evidence actually match (no inferential leap)
  4. Failure modes were probed, not assumed absent
  5. The verdict states its own confidence and what would change it
  6. The verdict survived a Breaker that never saw the verdict in advance
```

---

## Phase 4: The Contradiction Macro-Loop

Above the per-unit loop, a macro-loop hunts for cross-unit contradictions — two units whose
verdicts cannot both be true. Convergence conditions, not exhaustion, end the audit.

```
CONVERGE WHEN:
  - Every unit has a PASS verdict that survived attack, AND
  - No two surviving verdicts contradict, AND
  - Every cross-cutting unit has its own resolved gate
GLOBAL CAP: [3] full macro cycles. If not converged, report the unresolved contradictions
  as findings rather than forcing a verdict.
```

---

## Output Template

```
ROLE TAXONOMY: [the seven, with isolation rule stated]
SOURCE OF RECORD: [verified context — project IDs, schema, invariants, named fragility points]
INVARIANTS TO FALSIFY: [each P0 rule, phrased as something to break]

PER-UNIT MICRO-LOOP: act -> attack -> judge -> reflect -> store
COMPLEXITY BANDS + CAPS: [the banding table]
PASS CHECKLIST: [the six, incl. the adversarial sixth]
MACRO-LOOP + CONVERGENCE: [contradiction hunt + global cap]

DELIVERABLE:
  - Ledger (every unit + verdict + evidence)
  - Reality Matrix (claim vs verified state)
  - P0/P1/P2 Gate
  - Go / No-Go verdict with confidence
SAFE EXECUTION: read-only on production; approval gate before any mutation or branch creation
FALLBACK: [for unreliable connectors — reconstruct from local clone with staleness stamp]
```

---

## Reflection Protocol

- **Prediction:** "No verdict in this audit can ship without surviving an isolated attack."
- **Comparison:** Trace one unit — did the Breaker have access to the Judge's reasoning? If the
  prompt lets roles see each other's private work, isolation is broken; rewrite the role switch.
- **Deviation signal:** If complexity banding is absent, the audit will either over-spend on
  trivial units or under-attack complex ones — add the bands.
- **Escalation:** If the source of record is thin (no verified IDs, schema, or invariants), the
  audit will hallucinate ground truth. Route to context-grounding-pass before architecting.

---

## Anti-Patterns in Architecting

- **Self-grading**: producer and judge collapsed into one instance. The entire value is gone.
- **Verdict leakage**: the Breaker can see the verdict it is supposed to break — it will
  rationalize instead of attack.
- **Persona explosion**: inventing a unique character per gate instead of instantiating the
  fixed taxonomy per unit — unrelated characters, no separation guarantee.
- **Even-spread effort**: no complexity banding, so cost scales with unit count and trivial
  units get the same machinery as cross-cutting ones.
- **Silent down-banding**: shrinking coverage under budget pressure without saying so — fake
  coverage is worse than declared partial coverage.
- **Exhaustion-as-done**: ending when tired instead of at convergence — leaves contradictions
  unresolved and unflagged.

---

## Reference Files

| File | Purpose | When to Read |
|------|---------|-------------|
| `references/role-taxonomy.md` | Full role definitions, isolation rules, by-instruction fallback | When subagent dispatch is unavailable and isolation must be enforced in one context |
| `references/banding-and-caps.md` | Complexity-band definitions and per-band iteration caps | When sizing effort for a large or unfamiliar audit |
| `references/deliverable-shapes.md` | Ledger / Matrix / Gate / Verdict templates | When assembling the audit's output contract |

---

**Last Updated**: 2026-06-28
**Version**: 1.0
**Archetype**: Evaluate / Orchestrate — Pattern Recognition (banding + taxonomy) + Sequential Thinking (micro-loop) + Learning Loop (contradiction macro-loop)
