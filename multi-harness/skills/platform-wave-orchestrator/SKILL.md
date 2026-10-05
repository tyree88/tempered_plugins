---
name: platform-wave-orchestrator
description: Use when decomposing a large product, platform, component, or workflow backlog into implementation waves, agent lanes, branch plans, PR order, tracker mapping, and verification gates across one or more repositories.
---

# Platform Wave Orchestrator

Turn a messy backlog into shippable waves with clear ownership, branch strategy, review gates, and tracker updates.

## Use This When

- The user asks for agents, waves, feature branches, PR sequencing, or a reusable orchestration workflow.
- A backlog spans multiple surfaces, systems, or teams and needs decomposition before coding.
- Work must be reflected in GitHub, Notion, docs, or another tracker.
- The user wants a report that becomes the source of truth for follow-up branches.

## Workflow

1. **Verify live context**
   - Inspect repo root, current branch, remote default/develop branch, worktrees, open PRs, and linked issues.
   - Fetch relevant tracker schemas/pages before planning tracker writes.
   - Treat old plans, memory, and user summaries as hints until verified.

2. **Inventory the backlog**
   - List current features/components/workflows.
   - Mark what is already complete, partially complete, blocked, duplicated, or stale.
   - Preserve explicit user constraints and forbidden scope.

3. **Create 4-8 waves**
   - Prefer waves that can ship independently.
   - Wave 1 should usually freeze contracts, data shapes, architecture boundaries, or repo hygiene.
   - Later waves should avoid reaching backward to change the foundation unless verification proves it is needed.

4. **Assign agent lanes**
   - Keep each agent lane focused on one domain: foundation, implementation, QA, safety, docs/tracker, or release.
   - Record each lane's inputs, outputs, branch name, blockers, and verification gate.

5. **Define branch and PR order**
   - Default branch naming: `codex/<platform>-<wave-slug>`.
   - Default target: `develop` if present, otherwise the repo's protected integration branch.
   - One wave per branch unless the user explicitly asks for a combined PR.

6. **Map trackers**
   - Create or update tracker rows for each wave.
   - Keep roadmap/implementation rows separate from design/review/QA gates when those are distinct tracker surfaces.
   - Link the orchestration report back to all rows.

7. **Set verification gates**
   - Include repo-native checks, build/typecheck/test, preview smoke, accessibility, performance, security, or policy checks as appropriate.
   - Do not mark a wave complete until evidence exists.

## Output Shape

Use this compact structure:

- **Source Of Truth:** report path, tracker page, issue/epic.
- **Wave Table:** wave, branch, owner/agent, scope, dependencies, trackers, verification.
- **Agent Lanes:** responsibilities and handoff contracts.
- **Deferred Work:** named exclusions and why they are excluded.
- **Next Entry Point:** exact first branch and first command.

## Guardrails

- Do not invent tracker or PR state. Verify or label as pending.
- Do not close issues unless acceptance criteria are actually complete.
- Do not let one wave quietly absorb another wave.
- Use product-specific safety rules from repo manuals before proposing copy, data handling, or release gates.

