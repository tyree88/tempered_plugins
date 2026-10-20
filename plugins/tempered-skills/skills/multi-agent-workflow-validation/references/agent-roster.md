# Agent Roster

Use this roster to choose independent lenses for a workflow. Pick only the agents that match the task.

## Universal Agents

### User / Cold-Read Agent

Question: If I had no context, what would I think this is and what would I do next?

Checks:

- First impression and plain-language understanding.
- Primary user, job-to-be-done, and next action.
- Confusing terms, hidden assumptions, premature forms, or missing trust.

### Domain / Trust Agent

Question: Are the claims, risks, and constraints framed honestly and clearly?

Checks:

- Legal, medical, financial, privacy, security, or compliance language.
- Risky metaphors, misleading copy, unsupported claims, and trust gaps.
- Whether the safest interpretation appears early enough.

### QA / Evidence Agent

Question: What would prove this actually works?

Checks:

- Commands, browser tests, screenshots, logs, data samples, and production checks.
- Acceptance criteria and failure cases.
- Cleanup steps for test data or temporary files.

## Specialist Agents

### Design / UX Agent

Use for pages, apps, workflows, dashboards, forms, and visual artifacts.

Checks:

- Visual hierarchy, spacing, contrast, states, mobile/desktop behavior.
- Whether the design language matches the story and audience.
- Interaction persistence, overlays, navigation, and focus paths.

### Implementation Agent

Use for code, schemas, APIs, systems, and technical plans.

Checks:

- Architecture fit, type contracts, data flow, tests, maintainability.
- Blast radius, dependency choices, error handling, and shared abstractions.
- Whether the implementation preserves existing patterns.

### Release / Ops Agent

Use for deploys, branch promotion, environment changes, migrations, and production QA.

Checks:

- Branch state, PR state, commits, deployments, env vars, rollback path.
- Preview versus production truth.
- Secret handling and temporary artifact cleanup.

### Red-Team / Edge-Case Agent

Use when failures could be costly or when the result looks too clean.

Checks:

- Abuse cases, invalid inputs, race conditions, missing auth, empty states.
- How success could be misleading.
- What breaks under mobile, slow network, stale data, or unusual permissions.

### Content / Narrative Agent

Use for PRDs, landing pages, docs, decks, emails, and strategic plans.

Checks:

- Reader journey, claim order, tone, terminology, and missing context.
- Whether the document answers the question it appears to answer.
- Whether the strongest story is buried.

### Data / Measurement Agent

Use for analytics, dashboards, experiments, imports, reporting, and metrics.

Checks:

- Event definitions, attribution, sample quality, joins, filters, and denominators.
- Instrumentation gaps and privacy boundaries.
- Whether the metric answers the decision question.
