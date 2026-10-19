---
name: one-shot-prompt-craft
description: Use this skill when the user wants to create a prompt that will "one-shot" a complex design, document, architecture, or creative artifact — anything where the user has done a lot of thinking in a conversation and now wants the conclusions compressed into a prompt that another AI (or another session) can execute against in a single pass. Especially useful when the user says things like "turn this into a prompt", "give me a prompt that captures this", "create a prompt to one-shot X", "I need a realignment prompt", "I want to hand this off to [Claude/GPT/v0/Cursor/Figma Make]", or when a long design conversation has produced lots of scattered decisions that need to be consolidated. Also triggers when the user wants to build a realignment prompt for a few-shot workflow where an earlier prompt produced drifted output.
---

# One-Shot Prompt Craft

## What this skill is for

A one-shot prompt is one that gets pasted into an AI (Claude, GPT, v0, Cursor, Figma Make, Sonnet via API, etc.) with the expectation that the output in the very first response will be close to production-usable. No back-and-forth, no iterative refinement visible to the downstream AI. The user has done all the thinking already — the craft is in compressing that thinking into instructions dense enough and ordered correctly enough that the model's default behaviors align with what the user actually wants.

Most prompts fail not because they're too short but because they let the model's defaults slip through. Model defaults are sticky. If the user is building a social prediction app and the prompt says "design a home screen," the model will default to a Bloomberg-terminal aesthetic because that's what "prediction" triggers in training data. Good one-shot prompts block those defaults explicitly and early.

This skill is also for **realignment prompts** — the second prompt in a few-shot workflow, sent when the first prompt produced drifted output and the conversation needs to be course-corrected without starting over.

## The techniques this skill teaches

Seven named techniques, developed through iteration and proven in practice. When the user asks for a one-shot prompt, apply these together — they are load-bearing individually but compound when combined.

### 1. Thesis-first ordering

The thesis is the single sentence that answers "what makes this different from the thing the model will default to?" It goes before anything else in the prompt — before context, before specs, before output format.

Why this ordering matters: models read prompts sequentially and calibrate toward the first framing they receive. If the thesis lands on line 1, every subsequent instruction is interpreted through that lens. If the thesis is buried on page 3, the first two pages will have already shifted defaults the wrong direction and the thesis can't unshift them fully.

A good thesis is adversarial against the closest adjacent product the model might default to. "This app is iMessage-for-group-predictions. Kalshi is a Bloomberg terminal. This app is the opposite." names the enemy. Without the comparison, the thesis is too soft.

### 2. Anti-patterns immediately after thesis

Right after the thesis, enumerate the defaults the model will be tempted toward. Number them. Be specific. Vague anti-patterns get ignored.

Bad: "Don't make it look like a trader app."
Good: "NO charts, candlesticks, sparklines, or time-series graphs on the home screen. Ever. NO percentage-based probability odds as hero elements. NO red/green buy-sell coloring — winning is the user's accent color; losing is muted gray."

The specific version works because it blocks each concrete manifestation of the default. The vague version gets interpreted as "make it slightly more casual" and the model still generates a trading UI.

Anti-patterns go second because they extend the thesis — they're the thesis made operational. A model that has internalized "don't do X, Y, Z" produces different output than a model that has internalized "do A, B, C" even when X/Y/Z and A/B/C are logical opposites. Negative constraints are more behavioral.

### 3. Concrete samples over abstract descriptions

For voice, copy, style, tone, or any quality the model has to match, provide actual examples rather than adjectives.

Bad: "Use a warm, conversational voice that feels like a friend."
Good: "Copy samples to match this voice:
- 'Tyler just called it. You owe him a coffee 😤'
- 'Marcus took your side again — you're on a Companion streak 🤝'
- 'Your rival Jenny is on a 3-game heater. Time to end it.'

NOT: 'Prediction resolved.' 'Transaction complete.' 'Error: cap reached.'"

The examples teach voice in a way adjectives can't. Include both positive samples and negative samples (what it should NOT sound like). Negative samples are especially valuable for voice because they block sterile system-copy defaults.

### 4. Enumerated outputs with per-item specs

Open-ended requests drift. "Design the app" produces an unpredictable subset of screens. Instead, list the expected outputs explicitly, number them, and give each its own spec section.

For design work, that's a numbered list of screens. For documents, a numbered list of sections. For code, a numbered list of files or functions. For architecture, a numbered list of components.

Each item gets:
- What it is (one line)
- What it must contain (bullet list of elements)
- What it must NOT contain (especially when defaults would add them)
- An empty state or edge case if applicable

Scope discipline is the most common failure mode in one-shot prompts. Enumeration imposes it.

### 5. Self-check questions at the end

End the prompt with 3–5 yes/no questions the model must answer before declaring done. These are the prompt's final pass and they anchor the model back to the thesis.

Good self-check questions are specific and tied to the thesis:
- "If I open the home screen, am I seeing what events my people are in — or am I being shown 1v1 rivalry scores as the main content?"
- "Does the Event Page hold up for a 50-person event without the UI breaking down?"
- "When a prediction resolves, does the celebration feel group-scale rather than 1v1-scale?"

Bad self-check questions are generic and ignorable:
- "Is the design user-friendly?"
- "Did I cover everything?"

Frame each question as "If [user scenario], am I seeing [thesis-aligned outcome]?" The scenario grounds it; the thesis-aligned outcome tests against the thesis.

### 6. Few-shot realignment (not restart)

When a prompt produces drifted output and the user wants to course-correct, write a realignment prompt — not a fresh full prompt. A full restart discards the context the model already has and wastes tokens. A realignment names the drift explicitly and asks the model to revise affected outputs while leaving aligned outputs alone.

Realignment prompt structure:
1. **Name the drift explicitly.** "I overweighted X. Here is the actual product shape." Models don't self-correct from implied criticism.
2. **State what changed in your understanding.** The delta is the content.
3. **List which outputs are affected.** "Screens 1, 3, and 5 need revision. Screens 2, 4, 6–9 can stay."
4. **Ask the model to identify affected outputs first.** Before regenerating, the model should enumerate what it thinks is affected. This is an interception point — if the model's enumeration is wrong, you catch it before it wastes work.
5. **Rewrite the self-check questions** so they reflect the new thesis. Old self-check questions will pull the model back toward old behavior.

### 7. Preamble that explains the craft choices

When delivering the prompt to the user, include a short preamble (200–500 words) explaining why specific choices were made — why the thesis is phrased a certain way, why particular anti-patterns were included, why certain details were left out.

This serves three purposes:
- The user understands what's load-bearing and can revise intelligently
- The user can explain the prompt to collaborators
- When the prompt produces output that needs adjustment, the user knows which part of the prompt to edit

Without a preamble, users treat the prompt as a black box and either change nothing (even when they should) or change everything (losing the load-bearing parts). A short preamble turns the prompt from artifact into instrument.

## Workflow when the user asks for a one-shot prompt

Follow this sequence. Each step produces an output that informs the next.

### Step 1: Identify the thesis

Before writing anything, articulate the thesis in a single sentence using this template:

> "[Product/artifact] is [this thing]. The adjacent thing people will default to is [that thing]. [Product/artifact] is [how they differ]."

If the user hasn't given you enough to fill this in, ask 1–2 targeted questions. Do not proceed without a thesis. A prompt without a thesis will produce defaults, which is the failure mode this skill exists to prevent.

### Step 2: Enumerate the anti-patterns

Given the thesis, enumerate 10–15 specific things the model will be tempted toward because of training-data defaults. Number them. Be concrete.

Pull these from three sources:
- The adjacent product named in the thesis (what does it do that this one doesn't?)
- The user's stated concerns in the conversation so far
- Common model failure modes you know about from your own training (sterile copy, generic icons, over-formatting, etc.)

### Step 3: Enumerate the outputs

List the expected outputs. For design, this is screens. For docs, sections. For code, files. For architecture, components.

Number them. Group them by priority if helpful (top-five must-haves vs. secondary).

### Step 4: Gather concrete samples

For every place where voice, tone, or style matters, pull concrete samples from the conversation. If the conversation doesn't have them, ask the user to provide 3–5 examples of what they want and 3–5 examples of what they don't want.

### Step 5: Write the prompt

Assemble in this order:
1. Role/framing (1–3 sentences placing the model in the right mindset)
2. Product/artifact one-liner
3. The thesis (emphasized, short)
4. Anti-patterns (numbered list, specific)
5. Core design principles (4–8 bullets, opinionated)
6. Mental model and terminology (glossary table if there are named concepts)
7. Enumerated outputs
8. Per-output specifications
9. Voice/style section with concrete samples (positive and negative)
10. Technical output format (what the model should deliver — code? prose? markdown?)
11. Final self-check questions

### Step 6: Write the preamble

Before the code-fenced prompt, write a 200–500 word preamble explaining:
- How you thought about compressing the conversation into a prompt
- Which sections are load-bearing and why
- What you deliberately left out and why
- Known failure modes and how to spot them in the output

### Step 7: Deliver

Format the prompt in a single code block so the user can copy it cleanly. Place the preamble above it. Below it, add 2–4 sentences of "how to use this" guidance (which tools it works best in, what to watch for, common adjustments).

## Workflow when the user asks for a realignment prompt

When the user says the first prompt produced drifted output and wants a follow-up:

### Step 1: Name the drift

In one or two sentences, articulate what drifted. Be specific. "The first prompt overweighted [X] as the organizing principle when the actual product is organized around [Y]."

### Step 2: Identify affected outputs

List which outputs from the first prompt need revision and which can stay. Be explicit.

### Step 3: Write the realignment

Structure:
1. Header: "REALIGNMENT — IMPORTANT CORRECTION TO THE [PRODUCT/ARTIFACT] FRAMING"
2. Named drift section: "I overweighted X. Here is the actual shape."
3. What changed in understanding (the delta)
4. New anti-patterns added (extending the original list)
5. Revised output priorities (what's affected, what's not)
6. Revised specs for affected outputs
7. Updated voice/copy samples if voice drifted
8. New self-check questions aligned to the corrected thesis
9. Instruction to the model: "Identify affected outputs first, then revise. Ask before regenerating anything if unsure."

### Step 4: Write the preamble

Explain to the user why realignment (not restart) is the right move here, and which part of the prompt does the corrective work.

## Critical rules

**Never skip the thesis step.** A prompt without a thesis will produce default output. If the user hasn't articulated one, ask them directly or articulate one for them and get their buy-in before writing the prompt.

**Never use abstract descriptions where concrete samples would work.** "Use a friendly voice" is a failed instruction. Always prefer examples — at least 3 positive, 3 negative.

**Never bury important constraints deep in the prompt.** Thesis on line 1. Anti-patterns immediately after. The important stuff is always at the top.

**Always deliver the prompt in a code block.** Users copy-paste. If the prompt isn't cleanly code-fenced, formatting breaks when pasted into the target tool.

**Always include a preamble.** The prompt is not self-explanatory to the user. A preamble turns it from artifact into instrument.

**When realigning, never restart.** Restarts discard context and waste tokens. Name the drift, identify affected outputs, revise targeted sections.

## Examples of thesis framings that work

The thesis is the single most important line in a one-shot prompt. Here are examples of thesis framings for different kinds of artifacts:

**For a social prediction app:**
> "Kalshi is a transactional product — users show up alone with money. This is the opposite: iMessage-for-group-predictions, where users show up to see what their people are doing. Faces beat tickers."

**For a writing tool:**
> "Notion is infinitely customizable and therefore overwhelming. This is the opposite: opinionated, fast, no configuration — closer to a typewriter than a database."

**For an AI coding assistant:**
> "Copilot autocompletes lines. This operates at the level of intent — the user describes what they want and the assistant builds the whole change across multiple files."

**For a project-management tool:**
> "Jira is for engineering managers tracking teams. This is for makers tracking their own work — the database is invisible and the primary surface is the next thing to do."

Each thesis names the adjacent product explicitly, says "opposite" or "different," and gives one concrete dimension of the difference. Short. Memorable. Adversarial.

## What this skill deliberately does NOT try to do

This skill is for compressing a conversation's worth of thinking into a prompt. It is not for:
- Doing the thinking (the user brings the conclusions)
- Iterative prompt refinement against benchmarks (that's a different workflow)
- System-prompt design for deployed AI products (that needs different tradeoffs)
- Multi-turn agent prompts (those are built differently)

If the user asks for any of those, suggest a different approach.

## Reference files

Load these as needed during the workflow:

- **`references/structure-template.md`** — a fill-in-the-blanks template for the full prompt structure. Read this when writing a one-shot prompt from scratch. It has annotated sections and common filling-in mistakes.

- **`references/realignment-patterns.md`** — templates and named drift patterns for writing realignment prompts. Read this when the user asks for a follow-up prompt to correct drift in earlier output.

- **`references/worked-example.md`** — a complete worked example showing the techniques applied to a real product (a social prediction app). Read this when you want to see how all seven techniques fit together in a single coherent prompt.
