---
name: state-sequence-prompter
description: >
  Draft the actual generation prompts for a locked-identity image sequence — one base hero
  prompt plus one edit prompt per state — in the dense, art-directed style Nano Banana Pro
  responds to, with verbatim identity locks and named state deltas. Use this skill when it's
  time to write the prompts: "write the prompt", "draft the generation prompts", "give me the
  edit prompt for [state]", "turn this into a Nano Banana prompt", or as the Build step inside
  image-sequence-director. It consumes the Object DNA and Material Intelligence Package and
  emits prose or JSON per frame. Its discipline is subtractive: after the hero, it changes
  ONLY the state delta and copies every locked field verbatim — because re-describing the
  object is what causes drift.
---

# State-Sequence Prompter — Locked-Token Prompt Construction

Write prompts that change the object's state without changing the object. The craft is
**restraint**: the hero prompt is rich and complete; every edit prompt after it is the locked
identity block (verbatim) + the single named delta + references — and nothing else. Adding
description is adding drift.

Three engines:
- **Sequential Thinking** — construct each prompt by assembling fixed blocks in order
  (locks → delta → references → negatives), verifying the locks are byte-identical to the DNA.
- **Pattern Recognition** — pick prose vs JSON per frame by transition risk, and pick the
  negative-prompt set that matches the specific state's failure mode.
- **Learning Loop** — predict the drift vector for each frame and pre-empt it with a targeted
  re-assertion (e.g. "rim geometry unchanged" before a heat frame that would slump the rim).

---

## When to Use This Skill
- The prompt-writing step of `image-sequence-director`
- Standalone, to draft a base + edit-chain for any same-object sequence
- To rewrite a drifting prompt into a locked one

---

## Domain Pattern Library

### Prompt-type selection (prose vs JSON)
| Frame condition | Format | Why |
|-----------------|--------|-----|
| Hero / base generation | **Prose** | reasoning engine rewards a flowing art-director brief |
| LOW-risk additive/surface state | **Prose** | simple delta, easy to read & tweak |
| HIGH-risk (heat, reconstructive) | **JSON** | explicit byte-identical locked keys minimize drift surface |
| API/automation context | **JSON** | machine-checkable parity |

### The universal edit-prompt skeleton (after the hero)
```
[1] Identity anchor sentence: "Using the previous image as the exact reference, keep the
    same bowl — form, scene, and lighting identical."
[2] LOCKED BLOCK (verbatim from Object DNA): form · surface base · scene · camera · lighting
[3] STATE DELTA (the ONLY new content): the material change for this frame
[4] CONTINUITY RE-ASSERTION: the specific thing most likely to drift, pinned
[5] REFERENCES: prior good frame (+ extra anchor if reconstructive)
[6] NEGATIVES: artifacts specific to THIS state
```

### Anti-Patterns (Traps)
- **Re-describing the object** — restating silhouette/proportions in an edit prompt. The #1
  drift cause. The locked block is a *quote*, not a rewrite; the delta never touches form
  unless the state physically changes it (and then only that part).
- **Generic negatives** — "no artifacts" is weak. Match negatives to the state: heat frame →
  "no full-scene relight, no new background"; gold frame → "no new cracks, no random gold
  splatter off the seams."
- **Paraphrased locks** — "a wide shallow bowl" one frame, "a broad low bowl" the next. The
  model treats these as different objects. Copy the string exactly.

---

## Workflow
```
1. INTAKE     → receive Object DNA + Material Package + which state to draft
2. FORMAT     → choose prose or JSON for this frame (risk-based)
3. ASSEMBLE   → build the skeleton: lock (verbatim) + delta + re-assertion + refs + negatives
4. VERIFY     → diff the locked block against the DNA — must be identical
5. PREDICT    → state the expected drift vector so the auditor knows what to check
6. EMIT       → output the prompt + a one-line "watch for" note
```

## Phase 1: Intake
Receive the Object DNA, the Material Intelligence Package, and the target state. If drafting
the hero, you have no prior frame — build the full rich brief. If drafting an edit, you have
the DNA to quote.
→ **Checkpoint**: Do I have a concrete DNA to quote verbatim? If the DNA fields are vague,
the locks will be vague — send it back to the director to tighten before drafting.

## Phase 2: Choose format
Apply the prose-vs-JSON table. When unsure, prose for simple deltas, JSON for the molten and
gold frames.

## Phase 3: Assemble
Build the skeleton. The delta comes from the Material Package's state cluster — paste those
tokens. The continuity re-assertion targets the predicted drift (Phase 5 logic).

## Phase 4: Verify the locks
Compare the locked block against the Object DNA character-for-character. Any divergence is a
bug. This is the single highest-value check in the skill.
→ **Checkpoint**: Is the lighting lock present and identical? It's the most-dropped field.

## Phase 5: Predict the drift vector
Before emitting, name what will most likely drift on this frame, and confirm the prompt
pins it:
- cracked → drift is minimal; pin "silhouette unchanged."
- molten → drift is the rim/edges deforming the whole profile; pin "overall proportions and
  base footprint unchanged; only the rim softens."
- quenched → drift is resetting to the pristine shape; pin "keep the molten slump from the
  previous frame."
- gold-reform → drift is inventing new cracks / wrong silhouette; pin "restore hero
  silhouette; gold only on the cracked-frame fractures."

## Phase 6: Emit
Output the prompt and a one-line "watch for" passed to the drift-auditor.

---

## Reflection Protocol
- **Deviation**: did the frame drift somewhere I didn't predict? Add that vector to Phase 5.
- **Pattern update**: a negative-prompt phrasing that worked especially well?
- **Improvement signal**: one actionable note on lock or delta phrasing.

---

## Reference Files
| File | Purpose | When to Read |
|------|---------|-------------|
| `references/prompt-patterns.md` | The complete worked Tempered Works prompt set (hero + 5 states) in BOTH prose and JSON, plus reusable templates and negative-prompt sets per state | When drafting any frame — copy and adapt the matching template |

---

**Version**: 1.0
**Archetype**: Build
