---
name: platform-safety-review
description: Use when platform work touches sensitive data, regulated copy, identity, audit logs, secrets, compliance claims, clinical or financial language, or user-facing trust/safety boundaries.
---

# Platform Safety Review

Apply project-specific safety boundaries before shipping or tracker closeout.

## Workflow

1. **Find project rules**
   - Read repo manuals, AGENTS/CLAUDE instructions, security docs, compliance notes, and CI scripts.
   - Prefer project-specific vocabulary and data-handling rules over generic defaults.

2. **Classify risk**
   - Sensitive data: PHI, PII, secrets, auth tokens, identity, audit logs.
   - Regulated claims: clinical, legal, financial, compliance, security posture.
   - Operational risk: migrations, permissions, exports, external integrations.

3. **Inspect changed surfaces**
   - Code, tests, docs, tracker text, PR descriptions, screenshots, logs, and fixtures.
   - Check whether user-facing copy crosses from informational/analytical into decision-making language.

4. **Run available checks**
   - Secret scans, grep scripts, vocabulary checks, policy checks, schema audits, or custom repo commands.
   - When no check exists, document the manual inspection criteria.

5. **Report clearly**
   - Findings first, ordered by severity.
   - Include file/row/link references.
   - Separate blocker, follow-up, and accepted residual risk.

## Generic Defaults

- Do not store identity unless the project explicitly permits it.
- Do not put secrets or personal data in logs, URLs, comments, fixtures, screenshots, analytics, or tracker text.
- Do not overstate compliance, clinical, legal, or financial conclusions.
- Keep tracker updates privacy-safe because trackers are often broader-audience surfaces.

