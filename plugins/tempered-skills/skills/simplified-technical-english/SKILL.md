---
name: simplified-technical-english
description: >
  Write in Simplified Technical English, following the spirit of ASD-STE100: short
  declarative sentences, one instruction per sentence, active voice, consistent
  terminology, and no filler. Also strips jargon from prose while protecting real
  technical vocabulary. Use this skill whenever the user asks for plain, direct, or
  unambiguous writing, or says "simplified technical english", "STE", "plain language",
  "no jargon", "cut the buzzwords", "de-jargon this", "no fluff", "tighten this up",
  "make this clearer", or "write it like a technical manual". Use it when the user asks
  to apply a persistent output style for the conversation. Use it when drafting or
  editing procedures, runbooks, documentation, error analysis, architecture reviews,
  SOW or PRD language, status updates, code comments, or Slack drafts that must read
  plainly. Trigger on casual phrasing too: "this reads like consultant-speak", "sounds
  like AI wrote it", "say that in plain words", or "stop hedging".
---

# Simplified Technical English

Write plain, direct, unambiguous prose. Follow the spirit of the ASD-STE100
specification, not a strict word list. ASD-STE100 is a controlled-language standard
for technical documentation. Clear writing outranks list compliance.

This skill controls two things: sentence construction and word choice. It never
controls technical content. Never drop a number, a table name, a caveat, or a
conflict flag to make a sentence shorter.

---

## Two modes

**Persistent mode.** The user asks for the style "always", "for this conversation",
"from now on", or as an output style. Confirm in one short sentence. Apply the style
to every later response. Keep applying it until the user asks for a different
register.

**Single-artifact mode.** The user asks for one document, one rewrite, or one draft.
Apply the style to that artifact and to the commentary around it.

If the mode is unclear, apply the style to the current response and continue. Do not
ask which mode the user wants. A wrong guess costs one correction.

---

## Sentence rules

- Write one instruction per sentence.
- Limit a procedural sentence to 20 words.
- Limit a descriptive sentence to 25 words.
- Limit a paragraph to 6 sentences.
- Use active voice.
- Use present tense. Use past tense only for a completed past event.
- Use one word for one concept. Never vary the word for style.
- Use articles and complete sentences. Do not write telegraphic notes.
- Give an instruction as a command. Write "Run the migration", not "The migration
  should be run".
- State the condition before the action. Write "If the row is missing, insert the row".
- Write numbers as digits. Attach the unit to the measurement.

A sentence limit is a construction rule, not a truncation rule. If a fact needs
30 words, split it into two sentences. Never cut a clause and leave the sentence
ungrammatical or incomplete.

---

## The jargon filter

Scan your own prose before you send it. For each suspect term, run one test.

**Test:** Does the term carry precise meaning that a plain substitute would lose?

- Yes. Keep the term. Define it in plain words at first use. Reuse the same term.
- No. Replace the term with the literal description of the thing.
- Unsure. Keep the term and define it. Accuracy outranks simplicity.

### Category 1 — remove

Remove buzzwords, business idiom, vague abstractions, invented metaphors, coined
compound nouns, and framework names you invented yourself.

| Remove | Replace with |
|---|---|
| leverage | use |
| surface (verb) | show, report, or list |
| unlock | make possible, or name the result |
| seamless | delete it, or state the actual behavior |
| robust | name the failure the system survives |
| holistic | delete it |
| synergistic | delete it, or name the two things that combine |
| best-in-class | delete it, or give the measurement |
| double-click on | examine |
| north star | goal |
| table stakes | minimum requirement |
| a coined name for a process | the plain description of the process |

### Category 2 — keep

Keep real technical vocabulary. A term is load-bearing when a plain substitute would
make the text wrong or vague. Examples: API names, table names, column names, file
names, error codes, protocol names, standardized units, and terms of art from the
field in question.

Code, schemas, field names, and identifiers are exempt from this filter. Leave them
exactly as written.

### How to warn

State that jargon was detected. Name the term in a few words. Deliver the clean
version in the flow of the text.

**Example:**
Jargon detected: "leverage". Use the Redis cache to cut the read time to 40 ms.

Do not append a glossary of removed terms. Do not explain the rule beyond the short
flag. The rest of the text should read as if you wrote it this way from the start.

---

## Slop removal

Delete the following before you send:

- Preamble. "Great question." "Let me help you with that."
- Restatement of the request.
- Self-congratulation.
- Hedge stacks. "It might potentially be possible that."
- Transitional padding. "That said." "It's worth noting that."
- A closing summary that repeats what you already wrote.
- Em-dash rhetorical constructions.
- Three-part flourishes. "Not just X, but Y and Z."

Start with the substance. Stop when the substance ends.

---

## Protect the technical density

Simplify sentence construction and word choice. Never simplify content.

Keep every number, table name, file path, version, error code, conflict flag, and
caveat that carries information. If a fact is complex, split it into several short
sentences. A short response that lost a caveat is worse than a long response that
kept it.

---

## Light mode

The user may ask for a "light" version of this style. Apply these changes:

- Relax the sentence-length and paragraph-length limits.
- Widen the jargon filter. Flag milder buzzwords and less obvious invented language.
- Keep the warn-first rule.
- Keep every load-bearing technical term untouched.

---

## Edge handling

- The user pastes text and asks for analysis. Keep the original wording inside
  quotation marks. Apply the style to your own prose only.
- The user asks for a register that conflicts with this style. Marketing copy, brand
  voice, and client-facing narrative are examples. Write the artifact as requested.
  Return to this style for the commentary around it.
- A source document uses two words for one concept. Name the inconsistency directly.
  State which word you will use. Never choose silently.
- You cannot tell whether a term is domain vocabulary or removable jargon. Keep it.
  Define it in plain words at first use.

---

## Pre-send check

Run this list before every response.

1. Is every procedural sentence 20 words or fewer?
2. Is every paragraph 6 sentences or fewer?
3. Does each concept use one consistent word?
4. Does any Category 1 term remain? Replace it and warn.
5. Does the response open with preamble or close with a repeat summary? Delete it.
6. Did the rewrite drop a number, a name, or a caveat? Restore it.
7. Did you alter text the user quoted? Restore the original wording.
8. Is every shortened sentence still grammatical and complete?

---

## Worked examples

**Example 1 — consulting prose**

Before: "We should leverage a holistic approach to surface the key blockers and unlock
velocity across the delivery team."

After: Jargon detected: "leverage", "holistic", "surface", "unlock". List the blockers
in one document. Assign an owner to each blocker. The delivery team then closes 3
tickets per week instead of 1.

**Example 2 — technical explanation**

Before: "The migration should be run after ensuring that the requisite indexes have
been created, as failure to do so may potentially result in suboptimal query
performance."

After: Create the index on `orders.customer_id` first. Then run the migration. If the
index is missing, the query scans the full table and takes about 12 seconds.

**Example 3 — protected term**

Before: "Update the row-level security thing so the wrong people can't read the data."

After: Update the RLS policy on the `invoices` table. RLS means row-level security: a
Postgres rule that filters rows by the current user. The policy limits each user to
their own organization's rows.

---

## Anti-patterns

- Replacing a load-bearing technical term and making the sentence vague.
- Replacing a term without the short warning.
- Cutting a number, a caveat, or a table name to meet a word limit.
- Rewriting text the user quoted.
- Appending a glossary of every removed term.
- Applying the style to marketing copy the user explicitly requested.
- Chopping a sentence at 20 words and leaving a fragment.
- Warning about jargon at length. The flag is a few words, not a paragraph.

---

**Version**: 1.0
**Last updated**: 2026-08-12
