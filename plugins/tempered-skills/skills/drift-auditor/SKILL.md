---
name: drift-auditor
description: >
  Inspect a freshly generated sequence frame against the locked Object DNA and return a
  drift verdict — PASS, SOFT-FAIL, or HARD-FAIL — with a specific reason and a fix. Use this
  skill after every frame in a locked-identity image sequence, or whenever someone asks "did
  the object stay consistent", "does this still look like the same [object]", "check this
  frame for drift", "compare these two images", or as the gate step inside
  image-sequence-director. It is the honest mirror: it never rubber-stamps a frame because it
  looks good in isolation — it judges identity continuity against the anchor, because drift
  compounds and one bad frame poisons every frame after it. Trigger even on casual "does this
  match?" when an anchor image exists.
---

# Drift-Auditor — Frame-by-Frame Identity Continuity Gate

The model is probabilistic; consistency "excels but isn't always right." This skill is the
checkpoint that catches drift while it's still one frame, before it compounds into a different
object. It compares a new frame to the locked Object DNA (and the prior anchor) and returns a
gate verdict the director acts on.

Its stance is the same as `fit-assessment`: **honest, not encouraging.** A frame that's
"pretty close" is a SOFT-FAIL, not a PASS, because pretty-close drift accumulates.

Three engines:
- **Pattern Recognition** (dominant) — knows the drift signatures for each transition type and
  inspects the specific fields most likely to wander.
- **Sequential Thinking** — checks fields in priority order (silhouette → scene → lighting →
  surface → state correctness) and stops at the first disqualifying break.
- **Learning Loop** — feeds the failure reason back to the prompter as a targeted re-assertion,
  and logs recurring drift vectors.

---

## When to Use This Skill
- After every frame in `image-sequence-director` (the standard gate)
- Standalone, to compare any generated frame against a reference for consistency
- To diagnose WHY a sequence "stopped looking like the same thing"

---

## Domain Pattern Library

### Drift signatures by transition (what to inspect first)
| Transition | Most-likely drift | Inspect |
|------------|-------------------|---------|
| Additive damage | silhouette subtly redrawn while adding cracks | profile & footring vs hero |
| Heat / molten | whole proportions deform, not just rim; scene relit | base footprint, studio key direction, glow-is-gradient |
| Quenched | shape snaps back to pristine (loses the slump) | does it still match the molten frame's deformation? |
| Reconstructive / gold | NEW invented cracks; wrong silhouette; gold off-seam | fracture geometry vs cracked frame; silhouette vs hero |
| Angle change | object redesigned instead of re-shot | is it the same object from a new camera, or a new object? |

### The five checks, in priority order
1. **Silhouette & proportions** — does the outline/footprint match the anchor (allowing only
   the state's intended physical change)? Most disqualifying. 
2. **Scene & framing** — same background, placement, aspect ratio?
3. **Lighting & grade** — same key direction, contrast, colour temperature, grade?
4. **Surface identity** — same base material/glaze where the state hasn't changed it?
5. **State correctness** — did the intended delta actually happen, and ONLY that?

### Anti-Patterns (Traps)
- **Isolation bias** — judging a frame on its own merit. A gorgeous frame that's a different
  object is a HARD-FAIL. Always judge against the anchor.
- **Delta-blindness** — passing a frame because the new state looks great, missing that the
  silhouette drifted underneath it. Check identity BEFORE admiring the state.
- **Tolerance creep** — accepting slightly more drift each frame "since the last one was fine."
  Reset tolerance to the hero every time, not to the prior frame.

---

## Workflow
```
1. INTAKE   → receive the new frame, the Object DNA, the anchor(s), the "watch for" note
2. CHECK    → run the five checks in priority order; stop at first disqualifier
3. SCORE    → assign PASS / SOFT-FAIL / HARD-FAIL with the specific failed field
4. PRESCRIBE→ give the exact re-assertion the prompter should add, or escalate
5. LOG      → record the drift vector for the Reflection Protocol
```

## Phase 1: Intake
Get the frame, the DNA, the relevant anchor(s) (prior frame; plus hero + cracked frame for the
gold state), and the prompter's "watch for" note (the predicted drift vector).
→ **Checkpoint**: Do I have the right anchor for THIS transition? The gold frame needs two
anchors; auditing it against only the prior frame misses the silhouette-restore requirement.

## Phase 2: Run the five checks
Inspect in priority order. Stop at the first hard disqualifier — no need to score lower checks
if the silhouette is already a different object.

## Phase 3: Score
```
PASS       → all five checks hold (state delta correct, identity intact). Save as new anchor.
SOFT-FAIL  → identity holds but the state delta is wrong/weak/overshot, OR minor recoverable
             drift. One targeted re-roll.
HARD-FAIL  → silhouette/scene/lighting is a different object or scene. Re-anchor; if the hero
             itself is implicated, escalate to the user.
```

## Phase 4: Prescribe
Don't just fail it — say what to add. Examples:
- "SOFT-FAIL: rim slumped but so did the base footprint. Re-roll with 'base footprint and
  lower wall unchanged; only the rim and upper edge soften.'"
- "HARD-FAIL: gold seams trace cracks that aren't in the cracked reference. Re-roll
  multi-anchor; add 'gold strictly on reference B's fracture lines, no new cracks.'"
→ **Checkpoint**: Is my prescription a concrete token the prompter can paste, not vague advice?

## Phase 5: Log
Record the drift vector (which field, which transition) for the director's Reflection Protocol.

---

## Output Format
```
FRAME AUDIT — State [N]: [name]
Verdict: PASS | SOFT-FAIL | HARD-FAIL
Failed check: [silhouette/scene/lighting/surface/state] — or "none"
What drifted: [one specific sentence]
Prescription: [exact re-assertion token to add, or "proceed" / "escalate to user"]
Drift vector logged: [field + transition]
```

---

## Reflection Protocol
- **Deviation**: did a frame pass audit but look wrong in the final strip? My checks missed a
  dimension — add it.
- **Pattern update**: a recurring drift vector across jobs? Promote it to the signature table.
- **Improvement signal**: one actionable note (e.g. "always check footring separately from
  overall silhouette — it drifts independently on heat frames").

---

## Anti-Patterns to Avoid
- Passing on aesthetics over identity.
- Vague prescriptions ("make it more consistent").
- Letting tolerance creep frame to frame.
- Auditing the gold frame against one anchor instead of two.

---

**Version**: 1.0
**Archetype**: Evaluate
