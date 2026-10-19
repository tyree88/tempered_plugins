---
name: goal-loop-forge
description: >
  Convert a sprawling, flat, or conversational prompt into a tight single-agent execution
  loop with adversarial done-when termination. Use this skill whenever the user wants to
  "turn this into a goal prompt", "add a loop structure", "make this a /goal prompt",
  "simplify this into Codex goal structure", "restructure this for Claude Code / Codex /
  Cursor", "make this iterate", or hands over a long build/implementation prompt (checkout
  flow, auth integration, feature build, migration) that should burn down a backlog rather
  than run as one giant instruction. Also trigger when a flat checklist should become an
  iterative Scope -> Build -> Verify -> Checkpoint cycle, when the user wants explicit human
  gates between increments, or when the goal is a copy-paste-ready execution artifact for an
  autonomous coding agent. This is the BUILD-side loopifier. For audit/verification prompts
  that need multiple adversarial agents, use adversarial-verification-architect instead.
---

# Goal Loop Forge — Sprawl to Execution Loop

Take a prompt that tries to say everything at once and reshape it into a loop that does one
increment at a time, verifies it, and stops only when an adversarial gate confirms the work
is real. The output is a single execution prompt an autonomous agent can run end-to-end.

Core philosophy: **a build prompt should burn a backlog, not recite a specification.** A flat
spec lets the agent declare victory after touching the surface. A loop with a falsifiable
DONE-WHEN forces it to keep going until the work survives a test it did not write.

The three engines:
- **Sequential Thinking** decomposes the source into an ordered layer backlog and a standing
  standards block applied on every pass.
- **Pattern Recognition** classifies the source prompt (flat checklist, narrative spec,
  multi-feature dump) and detects which production standards are buried inside prose.
- **Learning Loop** is the DONE-WHEN gate itself — the loop's only legal exit, and it opens
  through falsification, never self-congratulation.

---

## When to Use This Skill

- A long, generic implementation prompt needs to become agent-executable
- A flat checklist should become an iterative, verifiable build loop
- The user wants explicit human checkpoints between increments
- A prompt needs reshaping for a named runtime (Claude Code, Codex goal structure, Cursor)
- The source prompt mixes scope, standards, and acceptance criteria in one undifferentiated wall

Do NOT use for: multi-agent audits or production-readiness verification (use
adversarial-verification-architect); pure one-shot design artifacts with no iteration
(use one-shot-prompt-craft).

---

## Workflow

```
1. CLASSIFY   -> What kind of source prompt is this? Extract the thesis.
2. BACKLOG    -> Decompose into an ordered layer sequence (MVP first, hardening last).
3. STANDARDS  -> Pull every "always do X" out of prose into one standing block.
4. GATE       -> Write the DONE-WHEN as falsifiable conditions, not self-assertions.
5. CONTROL    -> Add approval gates on irreversible steps + an escalation rule.
6. ASSEMBLE   -> Emit goal + clarify-gate + loop + standards + done-when as one artifact.
```

---

## Phase 1: Classify and Extract the Thesis

Before restructuring, identify the single load-bearing claim the prompt exists to enforce.
Every good build prompt has one: "use native Supabase passkeys, do not build a WebAuthn
server"; "every token mutation routes through a SECURITY DEFINER RPC." Promote it to the top
as the primary directive, then build a hard anti-patterns block beneath it that names the
wrong path explicitly.

**Source pattern signals:**
- *Flat checklist* — numbered tasks, no sequencing logic -> needs layer ordering
- *Narrative spec* — paragraphs describing the whole system -> needs decomposition into increments
- *Multi-feature dump* — several unrelated capabilities -> needs one loop per feature or a routed backlog

**Anti-pattern trap:** a source prompt that reads clean but has no thesis. If you cannot state
what the agent must NOT do, the loop has no spine — surface that gap to the user before forging.

---

## Phase 2: Build the Layer Backlog

Decompose the work into a fixed, ordered sequence the loop walks in order. The invariant:
**MVP first, hardening last, go-live gate at the end.** A canonical shape:

```
LAYER BACKLOG (process top to bottom):
  1. MVP happy path        -> smallest end-to-end slice that works
  2. Edge + failure paths  -> the cases the MVP skipped
  3. Integration           -> wiring to real services / persistence
  4. Hardening             -> security, validation, error handling
  5. Go-live gate          -> the checklist that blocks ship
```

Each layer is one loop iteration. The agent does not advance until the current layer passes
its slice of the DONE-WHEN.

---

## Phase 3: Extract the Standing Standards Block

Production standards are usually scattered through the source as one-off mentions
("validate price server-side", "verify webhook signatures", "label file paths"). Pull them all
into a single **standards block applied on every loop pass**, so they are not tied to whichever
layer happened to mention them.

```
STANDARDS (apply on every pass, every layer):
  - [Server-side validation rule]
  - [Signature / auth verification rule]
  - [Error-handling contract]
  - [File-path labeling / output-format rule]
  - [Read-only / query-before-mutate posture on live systems]
```

---

## Phase 4: Write the Falsifiable DONE-WHEN Gate

This is the heart. The loop terminates ONLY when the DONE-WHEN passes, and each condition must
be checkable by something other than the agent's own claim. Phrase conditions as falsification
targets, not affirmations.

```
DONE-WHEN (every condition must be independently verifiable):
  - [ ] [Behavior] confirmed by [test / DB query / live run], not by the agent asserting it
  - [ ] [Failure case] reproduced and handled, evidenced by [observation]
  - [ ] No item in STANDARDS is violated anywhere in the diff
  - [ ] [Irreversible step] either complete-with-evidence or explicitly gated for human approval
```

**Rule:** if a condition can go green by the agent saying "done," it is not a gate — rewrite it
as the test that would prove it false.

---

## Phase 5: Control Flow — Gates and Escalation

```
APPROVAL GATES (stop and request explicit human confirmation before):
  - Schema migrations, Dashboard / production config changes
  - Any production data mutation
  - Any irreversible or destructive action

ESCALATION RULE:
  If the same layer fails its DONE-WHEN slice [N] times, stop looping. Report the blocker,
  what was tried, and the smallest decision needed to unblock. Do not thrash.

OPTIONAL CHECKPOINT:
  After each layer, pause for human confirmation before advancing.
  (Drop this step if the user wants the loop to self-gate without pausing.)
```

---

## Output Template

```
GOAL: [single sentence — the outcome, not the steps]

CLARIFY GATE (ask once, only if blocking; otherwise proceed on stated assumptions):
  - [Decision 1 that changes the build path]
  - [Decision 2]

PRIMARY DIRECTIVE: [the thesis]
ANTI-PATTERNS (do not do these):
  - [The wrong path, named explicitly]

STANDARDS (every pass): [standing block]
LAYER BACKLOG (in order): [the sequence]

LOOP (per layer): Scope -> Build -> Verify -> Checkpoint
DONE-WHEN: [falsifiable conditions]
APPROVAL GATES / ESCALATION: [control flow]
```

---

## Reflection Protocol

Run after forging, before delivery:
- **Prediction:** "This loop will execute autonomously because every layer has a verifiable exit."
- **Comparison:** Walk the DONE-WHEN — could any condition pass without evidence? If yes, the
  prediction is false; rewrite that condition.
- **Deviation signal:** If more than one condition is self-asserting, the source thesis was too
  weak to anchor a loop — flag to the user that this may want a design pass, not just a reshape.
- **Escalation:** If the source prompt has no falsifiable acceptance criteria at all, say so
  plainly rather than inventing gates that look rigorous but check nothing.

---

## Anti-Patterns in Forging

- **Specification cosplay**: emitting the same flat spec with the word "loop" on top. If the
  agent would behave identically without the loop, you did not forge one.
- **Self-asserting gates**: DONE-WHEN conditions that the agent satisfies by claiming success.
- **Standards drift**: leaving production standards attached to single layers instead of the
  standing block, so later layers silently drop them.
- **Thesis-less loops**: no primary directive and no anti-patterns block, so the agent picks
  the wrong implementation path on iteration one.
- **Gate inflation**: adding approval gates to reversible steps, training the operator to
  click through them — reserve gates for genuinely irreversible actions.

---

## Reference Files

| File | Purpose | When to Read |
|------|---------|-------------|
| `references/loop-shapes.md` | Variant loop structures (Scope/Build/Verify, ReAct act/observe, Reflexion) | When the default Scope->Build->Verify->Checkpoint does not fit |
| `references/done-when-library.md` | Falsifiable acceptance-criteria patterns by domain | When writing the DONE-WHEN for an unfamiliar domain |
| `references/runtime-formats.md` | Per-runtime phrasing (Claude Code, Codex goal structure, Cursor) | When the target runtime is named |

---

**Last Updated**: 2026-06-28
**Version**: 1.0
**Archetype**: Build / Transform — Sequential Thinking (backlog) + Pattern Recognition (source class) + Learning Loop (DONE-WHEN gate)
