---
name: "multi-agent-workflow-validation"
description: "Use when testing, reviewing, validating, or improving any product, workflow, design, document, release, or plan with independent specialist perspectives, red-team reviews, staged QA, or evidence-based checks."
---

# Multi-Agent Workflow Validation

Imported from Codex on 2026-09-24. Run an artifact or workflow through a focused set of agent perspectives. Then synthesize their findings, make scoped improvements, and verify the result with evidence.

## Intake

Before assigning agents, identify:

- The artifact or workflow under review: app, page, code path, doc, resume, release, data job, ops flow, plan, or prompt.
- The primary user or operator.
- The desired outcome and the conversion or completion event.
- Non-negotiable constraints: security, privacy, legal, brand, release branch, budget, tooling, time.
- Available evidence: browser, tests, logs, screenshots, docs, tickets, production, staging, sample files.

If the user already gave a plan, treat it as the working spec and test against it.

## Agent set

Pick 3 to 6 independent lenses from the roster below. Always include these three:

- **User / cold-read:** asks what this is, who it is for, and what action is expected.
- **Domain / trust:** checks claims, risk, compliance, and confusing language.
- **QA / evidence:** defines the concrete checks that prove the workflow works.

Add specialists as needed: design, implementation, release, red-team, content, or data.

When the Agent tool is available, dispatch each lens as an independent subagent with a narrow prompt, and launch them in one message so they run in parallel. Otherwise, run the lenses sequentially and keep each finding separate until synthesis.

## Roster

**User / cold-read.** If I had no context, what would I think this is, and what would I do next? Checks first impression, primary user and next action, confusing terms, hidden assumptions, premature forms, and missing trust.

**Domain / trust.** Are the claims, risks, and constraints framed honestly and clearly? Checks legal, medical, financial, privacy, security, or compliance language. Also checks misleading copy, unsupported claims, and whether the safest reading appears early enough.

**QA / evidence.** What would prove this actually works? Checks commands, browser tests, screenshots, logs, data samples, production checks, acceptance criteria, failure cases, and cleanup of test data.

**Design / UX.** For pages, apps, dashboards, forms, and visual artifacts. Checks hierarchy, spacing, contrast, states, mobile and desktop behavior, whether the design fits the story and audience, and focus paths.

**Implementation.** For code, schemas, APIs, and technical plans. Checks architecture fit, type contracts, data flow, tests, blast radius, dependency choices, error handling, and existing patterns.

**Release / ops.** For deploys, branch promotion, env changes, migrations, and production QA. Checks branch and PR state, deployments, env vars, rollback path, preview versus production truth, and secret handling.

**Red-team / edge case.** For costly failures or results that look too clean. Checks abuse cases, invalid inputs, race conditions, missing auth, empty states, misleading success, slow networks, stale data, and unusual permissions.

**Content / narrative.** For PRDs, landing pages, docs, resumes, decks, emails, and plans. Checks reader journey, claim order, tone, terminology, missing context, whether the document answers its apparent question, and whether the strongest story is buried.

**Data / measurement.** For analytics, dashboards, experiments, imports, and metrics. Checks event definitions, attribution, joins, filters, denominators, instrumentation gaps, privacy boundaries, and whether the metric answers the decision question.

## Gated rollouts

For work that touches money, tokens, auth, database migrations, or user-owned data, appoint one coordinator before dispatching agents. The coordinator owns the branch, schema files, generated types, integration merges, and all human gates.

- Parallel agents may draft UI, tests, read models, route guards, docs, or helpers that do not overlap.
- The coordinator works sequentially on migrations, privileged SQL, generated clients, shared contracts, and final integration.
- Human gates are required before a live DB mutation, token-balance behavior change, payment crediting, production env flip, or destructive cleanup.

Name each gate and its unlock condition. If a gate is not approved, agents may keep drafting and testing locally, but must not perform the gated action.

## Agent prompt template

```text
Role: [agent lens]
Artifact/workflow: [what to inspect]
Goal: [desired outcome]
Constraints: [branch, design system, schema, compliance, etc.]
Evidence to inspect: [browser/tests/logs/files/docs]

Return:
- P0/P1/P2 findings with evidence
- What a user/operator would misunderstand or fail to do
- The smallest fix that would change the outcome
- Verification needed after the fix
```

Do not pass one agent's conclusions to another before synthesis, unless the workflow explicitly needs a second review round.

## Synthesis

Combine the findings into:

- A verdict: go, conditional go, or no-go.
- A diagnosis: what the artifact seems to be for, read without extra context.
- Load-bearing strengths to keep.
- P0, P1, and P2 issues, ordered by impact.
- An implementation plan with scoped changes.
- A verification plan with exact commands, viewports, files, URLs, data samples, or checks.

Prefer fixes that make the workflow clear sooner, reduce risk, and keep the existing architecture.

## Execution loop

1. Inspect the current truth first: rendered app, tests, logs, repo state, production, docs, or files.
2. Run the agent lenses.
3. Synthesize into a short prioritized plan.
4. Implement the smallest coherent set of changes.
5. Verify with the checks the QA agent identified.
6. Re-run the most relevant lenses on the changed artifact.
7. Ship or report only after evidence supports the verdict.

For long workflows, repeat the loop per stage rather than batching all feedback into one large rewrite.

## Evidence standards

- UI: screenshots, computed styles, browser interactions, no-overflow checks, accessibility selectors.
- Code: tests, lint, build, type checks, targeted assertions.
- Data: sample inputs and outputs, row counts, schema checks, cleanup notes.
- Release: PR state, commit SHAs, deployment readiness, live URL checks.
- Docs and plans: source citations, contradiction checks, acceptance-criteria coverage.

When evidence is unavailable, label the finding as an inference and say what would verify it.

## Output shape

For reviews: verdict, P0/P1/P2 findings, agent lens summary, recommended changes, verification plan, open questions.

For implementation: what changed, why it changed, the verification run, remaining risk, and the next useful step.

Keep the final answer short. Put the detailed thinking into the workflow and artifacts, not the close-out.