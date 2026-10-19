---
name: context-grounding-pass
description: >
  Ground a prompt in verified facts before it is written, and enforce a no-fabricated-numbers
  discipline throughout, so the generated prompt never ships confident-but-invented context.
  Use this skill whenever a prompt will hardcode project specifics (database IDs, schema, stack
  versions, API surfaces, competitor facts, cost figures, regulatory claims), or whenever the
  user says "ground this", "verify the context first", "make sure the facts are real",
  "no made-up numbers", "cite or label every claim", "pull the real schema/IDs before writing",
  or is building a research, due-diligence, cost-model, market-analysis, or technical-spec
  prompt. Also trigger as the pre-write gate before goal-loop-forge or
  adversarial-verification-architect when the source of record is thin. This skill retrieves
  and pins ground truth, ranks sources by authority, and forces every claim to be either
  sourced-and-dated or explicitly labeled an assumption. It supplies grounding; it does not
  design the prompt's logic or harden it.
---

# Context Grounding Pass — Sourced or Labeled, Never Invented

Before a prompt is written, retrieve the facts it will encode and pin them as a verified source
of record. Every claim that reaches the final prompt is either traceable to a dated source or
flagged as an assumption. Nothing in between — no confident invention.

Core philosophy: **a prompt that hardcodes an unverified fact launders a guess into an
instruction.** Once a wrong project ID, a stale version number, or a fabricated market figure
is baked into a reusable prompt, every downstream run inherits the error as if it were ground
truth. Grounding is the cheapest place to stop that.

The three engines:
- **Pattern Recognition** ranks each needed fact by source authority and detects the claims an
  unguarded model would fabricate (round numbers, plausible IDs, confident version strings).
- **Sequential Thinking** sequences retrieval — identify the facts, fetch from the highest
  authority available, cross-check the load-bearing ones — before any writing begins.
- **Learning Loop** enforces the sourced-or-labeled gate and records which facts were verified,
  which were assumed, and what would change the assumption.

---

## When to Use This Skill

- A prompt will hardcode project-specific facts (IDs, schema, stack, endpoints)
- A research / due-diligence / cost / market / spec prompt is being built
- The user demands no fabricated numbers and citation discipline
- As the pre-write gate when a build or audit prompt's source of record is thin
- Any time confident invention would silently corrupt a reusable artifact

Do NOT use for: prompts with no factual payload (pure creative or structural reshaping);
the prompt's control logic (use goal-loop-forge / adversarial-verification-architect).

---

## The Source-Authority Hierarchy

Rank every needed fact against this ladder and retrieve from the highest tier available. State
the tier next to each pinned fact so downstream readers know its strength.

```
TIER 1  Primary source of record    -> the system itself: live DB, the repo, the API, the filing
TIER 2  Peer-reviewed / standards   -> published literature, official specs, regulatory text
TIER 3  Market / competitive / fin. -> vendor data, analyst intelligence, pricing pages
TIER 4  Open web                    -> articles, docs, community sources (verify, do not trust)
TIER 5  Internal / first-party      -> notes, prior artifacts, recollection (treat as a lead)
```

**Rule:** a load-bearing claim retrieved only at Tier 4 or 5 must be cross-checked against a
higher tier or explicitly labeled an assumption. The most decision-critical fact gets the most
scrutiny, not a footnote.

---

## Workflow

```
1. INVENTORY  -> List every fact the prompt will encode. Mark load-bearing ones.
2. FETCH      -> Retrieve each from the highest authority available; record source + date.
3. CROSSCHECK -> Verify load-bearing facts against a second tier where possible.
4. GATE       -> Tag each fact: VERIFIED (source+date) or ASSUMPTION (label + what resolves it).
5. PIN        -> Emit a Source-of-Record block the prompt embeds verbatim.
```

---

## Phase 1: Fact Inventory

Enumerate what the prompt needs to state as true. Separate the load-bearing facts (the ones a
wrong value breaks the whole prompt) from the incidental ones.

```
FACT INVENTORY:
  - [Fact] | load-bearing? [Y/N] | needed because [the prompt uses it for X]
  - Project ID / schema / table names ...
  - Stack + versions (framework, runtime, SDK) ...
  - API surface / method names / endpoints ...
  - External figures (market size, cost, competitor capability, regulation) ...
```

**Fabrication-risk flags** — the model will invent these if unguarded: round market numbers,
plausible-looking IDs, current version strings, "industry-standard" percentages, method names
that sound right. Flag each for mandatory verification.

---

## Phase 2: Retrieve from Highest Authority

For each fact, go to the strongest source the runtime can reach:
- Project facts (IDs, schema, branch state) -> the live system or repo (Tier 1), not memory.
- Technical specs / SDK methods / API shapes -> official docs or a verification source like
  Context7 (Tier 2), not a confident guess.
- Market / competitive / financial -> named intelligence sources with dates (Tier 3).
- Anything else -> open web, then verify (Tier 4).

Record the source and the retrieval date alongside every fact. Undated facts decay silently.

---

## Phase 3: Cross-Check the Load-Bearing Few

Do not cross-check everything — cross-check the facts that the prompt's correctness hinges on.
Re-derive a cost from its inputs; confirm a schema claim against an actual query; check a spec
line against the primary standard. This is the bottom-up posture: the number must reconcile,
not merely sound plausible.

---

## Phase 4: The Sourced-or-Labeled Gate

Every fact exits as exactly one of two kinds. There is no third "probably true" state.

```
VERIFIED:    [fact]  -- source: [where] | date: [when] | tier: [1-5]
ASSUMPTION:  [fact]  -- labeled assumption; resolves when [what would confirm it]
```

If a fact cannot be verified and cannot honestly be assumed (it is genuinely unknown and
load-bearing), the gate fails — surface the gap to the user as a blocking question rather than
letting the prompt paper over it.

---

## Output Template (the pinned Source-of-Record block)

```
SOURCE OF RECORD (verified [date]; the prompt treats this as ground truth):
  VERIFIED:
    - [Project ID] -- source: live project | date: [...] | tier: 1
    - [Schema / tables / invariants] -- source: repo migrations | tier: 1
    - [Stack + versions] -- source: [...] | tier: 1-2
    - [External figure] -- source: [named, dated] | tier: 3
  ASSUMPTIONS (explicitly not verified):
    - [Assumption] -- resolves when [...]
  ANTI-HALLUCINATION RULE (carried into the prompt):
    Every claim is sourced-and-dated or labeled an assumption. No fabricated numbers, IDs,
    versions, or method names. If unknown and load-bearing, ask — do not invent.
```

---

## Reflection Protocol

- **Prediction:** "Every fact this prompt hardcodes is either verified with a dated source or
  flagged as an assumption."
- **Comparison:** Scan the Source-of-Record block — is any value present without a tier tag or
  an assumption label? If yes, the prediction is false; that value is an unmarked guess.
- **Deviation signal:** If load-bearing facts are sitting at Tier 4/5 with no cross-check, the
  prompt is built on sand — escalate verification before writing proceeds.
- **Escalation:** If the runtime cannot reach the primary source (e.g. a flaky connector to the
  live DB), stamp the fact as reconstructed-and-stale and say so, rather than presenting a
  reconstruction as Tier 1 truth.

---

## Anti-Patterns in Grounding

- **Confident invention**: emitting a plausible ID, version, or market number with no source
  and no assumption label — the exact failure this skill exists to prevent.
- **Memory-as-source**: hardcoding project facts from recollection instead of the live system,
  when the live system is reachable.
- **Undated facts**: pinning a figure with no retrieval date, so staleness is invisible.
- **Uniform cross-checking**: spending equal verification effort on incidental and load-bearing
  facts, then running out of budget before the one that mattered.
- **Assumption smuggling**: phrasing an assumption as a fact to make the prompt look more
  certain than the evidence supports.
- **Silent reconstruction**: presenting a connector-failed reconstruction as primary truth with
  no staleness stamp.

---

## Reference Files

| File | Purpose | When to Read |
|------|---------|-------------|
| `references/authority-hierarchy.md` | Full tier definitions with per-domain source examples | When the fact domain is unfamiliar (legal, clinical, financial) |
| `references/retrieval-routing.md` | Which tool reaches which tier (live DB, Context7, market intel, web) | When deciding where to fetch a given fact |
| `references/fabrication-flags.md` | Catalogue of facts models invent + how to verify each | When inventorying facts for an unguarded-fabrication risk |

---

**Last Updated**: 2026-06-28
**Version**: 1.0
**Archetype**: Research / Monitor — Pattern Recognition (authority ranking + fabrication flags) + Sequential Thinking (retrieval order) + Learning Loop (sourced-or-labeled gate)
