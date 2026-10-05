---
name: platform-tracker-sync
description: Use when syncing implementation waves, PRs, issues, design gates, QA evidence, or closeout status across Notion, GitHub, docs, or other trackers. Emphasizes live schema verification and non-invented tracker state.
---

# Platform Tracker Sync

Synchronize work across source reports, GitHub, Notion, and repo docs without pretending a write happened.

## Use This When

- The user asks to update Notion, GitHub issues, PR descriptions, roadmap rows, design gates, or status trackers.
- A report or plan must become durable tracker records.
- A PR is opened, updated, merged, or blocked and the trackers need to reflect it.

## Workflow

1. **Find the source of truth**
   - Identify the canonical report, issue, PR, roadmap, or design page.
   - Fetch live tracker state before deciding whether to create or update.

2. **Fetch schemas first**
   - For Notion databases, fetch the database/data source and use exact property names and expected value shapes.
   - For GitHub, inspect issue labels, milestones, linked PRs, checks, and current comments.

3. **Upsert carefully**
   - Search for existing rows by stable names, branch names, issue IDs, or report URLs.
   - Update existing rows when they are clearly the same work.
   - Create new rows only when no matching record exists.

4. **Cross-link every surface**
   - Tracker row -> report, PR, issue, branch, verification evidence.
   - Report -> tracker rows and design/QA gates.
   - PR -> issue and tracker rows.

5. **Record status honestly**
   - Planned/not started means tracked but not implemented.
   - In progress means a branch/PR exists and work is active.
   - Done means acceptance criteria and verification evidence are complete.

6. **Fallback if tools fail**
   - Do not claim the tracker was updated.
   - Produce a pending-update block with exact titles, fields, and links for the next agent.

## Notion Notes

- Multi-select and relation payloads can vary by connector and database. If a write fails, refetch the schema and retry with the encoded shape the live database expects.
- Do not assume two databases with the same title have the same schema.
- Use compact, de-identified tracker text for sensitive projects.

## GitHub Notes

- Prefer current remote state over local assumptions.
- If connector writes fail, authenticated `gh` commands are a valid fallback when available.
- Never close an issue from a component/planning PR unless the issue's acceptance criteria are fully covered.

