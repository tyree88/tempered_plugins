---
name: ai-writing-detector
description: >
  Analyze any text for signs of AI generation, producing a scored assessment with
  evidence, confidence level, and remediation guidance. Use this skill whenever the
  user asks to "check for AI," "audit this text," "does this sound like AI," "AI
  hygiene check," "make this sound more human," "de-AI this," "clean up AI patterns,"
  "check my writing," or pastes text with concerns about it reading as machine-generated.
  Also trigger when the user says "before I submit this," "review for AI tells," "would
  a recruiter think AI wrote this," or "does this pass the sniff test." Works on any
  genre: resumes, cover letters, LinkedIn posts, blog posts, emails, articles, academic
  writing, marketing copy. The skill produces both detection (what signals are present)
  and remediation (how to fix them). Even casual requests like "does this sound off?"
  should trigger if AI-generation is the concern.
---

# AI Writing Detector — Field Guide to Machine-Generated Text

Analyze text for signs of AI generation using the taxonomy built from Wikipedia's
15,000-word "Signs of AI writing" guide, 6 talk page archives of editor debate,
academic research on LLM linguistic fingerprints, and cross-platform journalism
covering AI detection patterns.

**Core philosophy:** No single signal proves AI authorship. Clusters across multiple
categories at sufficient density do. This skill scores on *cross-category convergence*,
never individual tells.

---

## When to Use This Skill

- Pre-submission hygiene: checking resumes, cover letters, LinkedIn content before sending
- Content audit: reviewing blog posts, articles, marketing copy for AI patterns
- Editing assistance: rewriting AI-assisted drafts to sound authentically human
- Curiosity: "did AI write this?" analysis on any text
- Self-check: auditing your own AI-assisted writing before publication

---

## Workflow

```
0. REFRESH     → Fetch Wikipedia source page for new/updated patterns
1. INTAKE      → Accept text + classify genre/context
2. SCAN        → Run 8 detection categories against the text
3. CLUSTER     → Group findings, weight by cross-category overlap
4. HUMANNESS   → Check for counter-indicators (signs of human authorship)
5. SCORE       → Composite score with confidence band
6. EVIDENCE    → Specific findings with text references
7. VERDICT     → Assessment tier + rationale
8. REMEDIATE   → (If requested) Specific edits to humanize the text
```

---

## Phase 0: Live Source Refresh

**Every time this skill is triggered**, before analyzing any text, fetch the Wikipedia
source page to check for new or updated patterns. This page is actively maintained by
hundreds of Wikipedia editors reviewing thousands of AI-generated submissions — it is
the most current, empirically-grounded catalog of AI writing tells in existence.

### Refresh Protocol

1. **Fetch the source page** using `web_search` for:
   `Wikipedia "Signs of AI writing" new patterns 2026`
   This captures both the main page content and recent talk page activity where new
   patterns are debated before being added to the main page.

2. **Scan for delta** — Compare fetched content against the taxonomy in
   `references/detection-taxonomy.md`. Look for:
   - New vocabulary words or phrases not in the current Tier 1/2/3 lists
   - New structural patterns not in Categories 1-8
   - Updated era tags (e.g., a word that was "persistent" is now "declining")
   - New model-specific fingerprints (new model releases create new patterns)
   - Patterns that have been REMOVED or downgraded by editors (false positive corrections)
   - New false positive warnings

3. **If new patterns found:**
   - Integrate them into the current analysis immediately
   - Flag them in the evidence report: "**[NEW]** Pattern not in base taxonomy — sourced
     from Wikipedia update [date]"
   - After the analysis, recommend updating the taxonomy file

4. **If no new patterns found:**
   - Proceed with existing taxonomy. No need to mention the refresh to the user.

### Source URLs to Check

| Source | What It Provides | Priority |
|--------|-----------------|----------|
| `Wikipedia Signs of AI writing` (main page) | Canonical pattern list | Always check |
| `Wikipedia talk:Signs of AI writing` (current talk, not archives) | Patterns under debate, emerging signals not yet promoted | Check if main page seems unchanged |
| `Wikipedia WikiProject AI Cleanup` | New detection techniques, community findings | Check periodically |

### Why This Matters

AI models update constantly. GPT-5.1 suppressed em dashes. Claude reduced "I'd be happy to."
New models emerge with new fingerprints. The Wikipedia editors track these shifts in near
real-time. A static taxonomy degrades within months. The live refresh keeps this skill
current without manual maintenance.

**Performance note:** The refresh adds one web search call per skill invocation. This is
a worthwhile trade — catching a new pattern that would have been missed is worth more than
the 2-3 seconds of latency.

---

## Phase 1: Intake & Genre Classification

Before scanning, classify the text. Genre calibration matters because formal business
writing naturally shares patterns with AI output (clean grammar, structured transitions).

### Genre Calibration Profiles

| Genre | Baseline AI Overlap | Threshold Adjustment | Notes |
|-------|-------------------|---------------------|-------|
| **Resume / Cover Letter** | High | Raise threshold +15 | Formal structure expected; focus on vocabulary, parallelisms, and sanitization |
| **LinkedIn Post** | Moderate | Standard | Mix of professional and personal voice expected |
| **Blog / Article** | Low-Moderate | Standard | Personal voice, concrete examples expected |
| **Academic Writing** | High | Raise threshold +20 | Formal transitions, hedging, and structure are normal |
| **Email / Slack** | Low | Lower threshold -10 | Casual voice expected; AI patterns stand out sharply |
| **Marketing Copy** | High | Raise threshold +15 | Promotional language is the genre, not a signal |
| **Creative Writing** | Low | Lower threshold -15 | AI creativity patterns are most distinctive |
| **Wikipedia Article** | Low | Standard | Encyclopedic tone has specific norms AI violates |

**Decision point:** If genre is ambiguous, ask the user. Never guess on calibration —
it changes the final score by 15-20 points.

---

## Phase 2: Detection Scan — The 8 Categories

Read `references/detection-taxonomy.md` for the full taxonomy with examples and
signal weights. Below is the operational summary.

### Category 1: Significance Inflation (Weight: Moderate)
LLMs reflexively inflate importance. Look for:
- "Marking a pivotal moment," "stands as a testament to," "plays a significant role"
- "Watershed moment," "symbol of resilience," "leaves a lasting impact"
- "Part of a broader movement," "represented a significant shift toward"
- Travel-brochure language: "rich cultural heritage," "breathtaking," "nestled in the heart of"

**False positive risk:** Press releases, tourism writing, grant applications naturally use this language.

### Category 2: AI Vocabulary Clusters (Weight: Strong when clustered)
These words are individually common but cluster distinctively in AI output:
- **High-signal words:** delve, tapestry, pivotal, underscore, landscape, foster, testament, enhance, intricate, multifaceted, beacon, realm, harness, illuminate, meticulous, commendable, paramount, commence, showcase, noteworthy
- **Transition overuse:** moreover, furthermore, in addition, on the other hand, it is worth noting
- **Editorial intrusions:** "it's important to note," "no discussion would be complete without"

**Scoring rule:** 1 word = noise. 2 words = note. 3+ words from this list = strong signal.
**Era awareness:** "Delve" was peak GPT-4 (2023-2024), declined sharply by 2025. Weight accordingly.

### Category 3: Structural Patterns (Weight: Strong)
- **Negative parallelisms:** "It's not X, it's Y" / "Not just X, but Y" / "Not only X, but also Y"
- **False ranges:** "From [X] to [Y]" where X and Y aren't actual spectrum endpoints
- **Rule of three:** Formulaic lists of exactly three items
- **Compulsive summaries:** "In summary," "Overall," "In conclusion" for short passages
- **Section-ending wrap-ups:** Every section gets a tidy bow
- **Treadmill effect:** Low information-per-word ratio; circling ideas without adding new content

### Category 4: Formatting Tells (Weight: Moderate)
- Em dash overuse (where commas, colons, or parentheses would be natural)
- Markdown artifacts in non-markdown contexts (**bold**, *italic*, # headers)
- Title case in headings where sentence case is expected
- Excessive boldface for emphasis
- Excessive bulleted/numbered lists where prose would be natural
- Uniform sentence length (no rhythm variation)
- Emojis in formal or semi-formal text

### Category 5: Citation & Reference Tells (Weight: Strong, context-specific)
- Hallucinated references: fake DOIs, invalid ISBNs, broken URLs
- Over-attribution: painstakingly naming sources for trivial facts in body text
- "Source+1" citation format (copied from chatbot search interface)
- Placeholder artifacts: "[URL of reliable source]," "turn0search0"

### Category 6: Communication Leakage (Weight: Very Strong)
- Chatbot greetings: "Certainly!", "I'd be happy to help", "Let me know"
- Knowledge cutoff disclaimers: "as of [date]," "Up to my last training update"
- Role admissions: "as an AI language model"
- Task framing: "Here is your [deliverable] on [topic]"

**Note:** These are smoking guns — if present, the text is almost certainly AI-generated
with minimal human review. But they're also the easiest to catch and remove.

### Category 7: Hedging & Sanitization (Weight: Moderate)
- **AI hedging:** "it appears," "based on available information," "to the best of my knowledge"
- **Human hedging (counter-indicator):** "I think," "not sure but," "IIRC," "my gut says"
- **Sanitization:** Absence of friction, setbacks, negative experiences, or uncertainty
- **Overclaimed consensus:** "experts agree," "widely recognized," "modern researchers"
- **Contrast framing:** Writing as if correcting a misconception no one stated

### Category 8: Model-Specific Fingerprints (Weight: Moderate)
- **ChatGPT:** Exclamation marks, "Certainly!", em dashes (pre-GPT-5.1), turn0search0
- **Claude:** Longer hedged sentences, "I'd be happy to," frequent linebreaks, progressive verbosity
- **Gemini:** Distinct hallucination patterns, particularly on social/cultural topics
- **Cross-model:** Perfect grammar + zero personality = universal AI signal

---

## Phase 3: Cluster Analysis

Individual signals mean little. Cross-category clusters mean everything.

### Clustering Rules

1. **Same-category clustering:** 3+ signals from one category = moderate indicator
2. **Cross-category clustering:** 2+ signals from 3+ different categories = strong indicator
3. **Multiplier:** Cross-category clusters get 1.5x weight
4. **Density:** Signals-per-paragraph matters more than total count. A 500-word text with
   8 signals is more suspicious than a 5,000-word text with 8 signals.

### The Convergence Test

Ask: "Could a competent human writer produce this exact combination of patterns?"
- If the answer is "yes, easily" (e.g., a formal academic paper with transitions and hedging) → reduce confidence
- If the answer is "only if they were deliberately imitating AI" → maintain confidence
- If the answer is "no, this combination is distinctively machine-generated" → high confidence

---

## Phase 4: Humanness Counter-Indicators

These signals suggest human authorship and REDUCE the AI score:

- **Genuine imperfection:** Run-on sentences, fragments, unusual capitalization, typos
- **Personal specificity:** Named people, dates, places, concrete numbers from experience
- **Friction acknowledgment:** "This took longer than expected," "We were wrong about X"
- **Informal hedging:** "I think," "honestly," "look," "here's the thing"
- **Sentence rhythm variation:** Short. Then long and winding. Then medium. Then a fragment.
- **Idiosyncratic word choice:** Slang, regional expressions, unusual metaphors
- **Genuine opinion with stakes:** Taking a position that could be wrong, not hedging everything
- **Missing conclusions:** Content that just stops or transitions without wrapping up
- **Inconsistent formatting:** Mix of styles within a piece (not from sloppiness, from naturalness)

**Key insight from Wikipedia editors:** "I've never seen an AI-generated message that
contains run-on sentences, misspellings, or unusual capitalization." Human messiness
is itself a reliability signal.

---

## Phase 5: Scoring

### Score Calculation

```
Base Score = Sum of (signal_weight × category_weight)
Adjusted Score = Base Score × genre_calibration_modifier
Cross-Category Bonus = 1.5x for signals spanning 3+ categories
Humanness Reduction = -5 per strong counter-indicator (cap at -25)
Final Score = max(0, min(100, Adjusted Score + Bonus - Reduction))
```

### Signal Weights

| Signal Type | Weight |
|-------------|--------|
| Communication Leakage (Category 6) | 15 per instance |
| AI Vocabulary Cluster (3+ words from Category 2) | 12 |
| Structural Pattern (Category 3) | 8 per pattern |
| Significance Inflation (Category 1) | 5 per instance |
| Formatting Tell (Category 4) | 4 per instance |
| Citation Tell (Category 5) | 10 per instance |
| Hedging/Sanitization (Category 7) | 6 per pattern |
| Model Fingerprint (Category 8) | 8 per match |

### Verdict Tiers

| Score | Tier | Meaning |
|-------|------|---------|
| 0-15 | **Likely Human** | Few or no AI signals detected. Natural writing patterns present. |
| 16-35 | **Probably Human** | Some patterns overlap with AI, but consistent with genre norms or formal style. |
| 36-55 | **Inconclusive** | Enough signals to warrant attention, but not definitive. Could be AI-assisted with editing, or formal human writing. |
| 56-75 | **Probably AI** | Multiple cross-category signals. Pattern density exceeds what formal human writing typically produces. |
| 76-100 | **Almost Certainly AI** | High-density signals across 4+ categories with minimal human counter-indicators. |

### Confidence Band

Report confidence alongside the score:
- **High confidence:** Long text (500+ words), 4+ categories with signals, clear clusters
- **Medium confidence:** Medium text (150-500 words), 2-3 categories, some clustering
- **Low confidence:** Short text (<150 words), 1-2 categories, ambiguous patterns

---

## Phase 6: Evidence Report

Structure the output as:

```
## AI Writing Analysis

**Genre:** [classified genre]
**Score:** [X]/100 — [Verdict Tier]
**Confidence:** [High/Medium/Low]

### Signals Detected

**[Category Name]** (X signals)
- "[quoted text fragment]" → [pattern name] (weight: X)
- "[quoted text fragment]" → [pattern name] (weight: X)

**[Category Name]** (X signals)
...

### Cross-Category Clusters
- [Pattern A] + [Pattern B] + [Pattern C] → cluster across Categories X, Y, Z

### Human Counter-Indicators
- [Counter-indicator observed]

### Summary
[2-3 sentence assessment: what's driving the score, how confident you are, and
what the user should do about it]
```

---

## Phase 7: Remediation (Opt-In)

When the user wants to fix AI patterns, not just detect them. Read
`references/remediation-playbook.md` for the full editing guide.

### Quick Remediation Checklist

1. **Kill AI vocabulary.** Replace with plain equivalents. "Utilize" → "use." "Commence" → "start." "Facilitate" → "help." Cut "delve," "tapestry," "beacon" entirely.
2. **Break rhythm uniformity.** Follow a 25-word sentence with a 4-word one. Then a fragment. Uniform length is one of the strongest AI signals.
3. **Add concrete specifics.** Replace "significant impact" with the actual number. Replace "various stakeholders" with who, specifically.
4. **Introduce human friction.** Acknowledge one thing that was hard, unexpected, or didn't work the first time.
5. **Kill compulsive summaries.** Delete every "In summary," "Overall," and "In conclusion" unless the section is genuinely long enough to need one.
6. **Collapse false ranges.** "From technical expertise to creative vision" → just state both directly.
7. **Vary punctuation.** Replace half the em dashes with commas, colons, or parentheses.
8. **Cut editorial commentary.** Remove "it's important to note," "it is worth mentioning," "no discussion would be complete without."
9. **Replace AI hedging with human hedging.** "Based on available information" → "from what I've seen." "It appears that" → "I think."
10. **Increase information density.** For every paragraph, ask: "What NEW information does this add?" If the answer is "it restates the previous paragraph," cut it.

### Resume-Specific Remediation

Since this skill is heavily used for pre-submission resume checks:
- Scan for banned AI phrases that flag in ATS or recruiter review
- Verify bullet cadence varies (not every bullet starts with past-tense verb)
- Check that summary doesn't read as a ChatGPT "professional summary"
- Ensure metrics are specific and grounded, not vague significance claims
- Confirm no em dashes (per standing resume rules)

---

## Reflection Protocol

After every analysis, internally assess:

1. **Was the genre calibration right?** Would a different genre classification change the score materially?
2. **Were any signals ambiguous?** Flag them explicitly rather than counting them at full weight.
3. **Was the text too short for reliable analysis?** If under 100 words, say so — short samples are unreliable.
4. **Did I over-weight any single category?** Cross-check that no single category drives more than 40% of the score.
5. **Would a Wikipedia editor agree with this assessment?** The Wikipedia editors developed most of this taxonomy through thousands of real-world cases. Use their rigor as a benchmark.

---

## Anti-Patterns in Detection

Mistakes this skill must avoid:

- **Single-signal conviction:** Never conclude "AI" from one pattern, no matter how strong.
- **Formality bias:** Formal writing is not AI writing. Academic papers, legal documents, and grant proposals naturally share AI patterns.
- **Non-native speaker bias:** AI detection tools have documented discrimination against non-native English speakers (20% false positive rate for Black students, per Common Sense Media 2024). Be cautious with text that may reflect ESL patterns.
- **Style policing:** The goal is detecting AI, not enforcing a preferred writing style. Clean, polished prose is not inherently suspicious.
- **Version blindness:** AI models change rapidly. Patterns that were strong tells in 2023 may be irrelevant in 2026. Weight recent intelligence higher.
- **Confirmation bias:** If the user suspects AI, resist anchoring on their suspicion. Score the text, not the suspicion.

---

## Reference Files

| File | Purpose | When to Read |
|------|---------|-------------|
| `references/detection-taxonomy.md` | Full taxonomy with examples, weights, era tags, and false positive notes | Before every analysis (core reference) |
| `references/remediation-playbook.md` | Detailed editing guide for humanizing AI text | When user requests fixes, not just detection |

---

## Sources

This skill synthesizes detection intelligence from:
- Wikipedia:Signs of AI writing (~15,000 words, continuously updated by editors reviewing thousands of AI submissions)
- Wikipedia talk:Signs of AI writing (Archives 1-6, containing editor debates refining signal reliability)
- Wikipedia:WikiProject AI Cleanup and Guide
- Weber-Wulff et al. (2023) — AI detection tools accuracy study
- ACL Anthology research on LLM vocabulary fingerprints
- Beutler Ink, NPR, The Decoder, Dataconomy, TechSpot, Literary Hub, Medium coverage
- Grammarly and SEOengine.ai AI vocabulary analyses

**Last Updated:** 2026-04-08
**Version:** 1.0
**Architecture:** Evaluate Archetype (Pattern Recognition dominant, Sequential Thinking for scoring)
