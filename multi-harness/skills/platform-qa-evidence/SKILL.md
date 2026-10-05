---
name: platform-qa-evidence
description: Use when defining or running verification gates for implementation waves, including build/typecheck/test, preview smoke, accessibility, Lighthouse, screenshots, interaction checks, and evidence summaries for PRs or trackers.
---

# Platform QA Evidence

Turn "looks done" into repeatable proof that can travel with a PR, issue, or tracker row.

## Workflow

1. **Discover native commands**
   - Read package scripts, CI workflows, Makefiles, test configs, and project manuals.
   - Prefer existing commands over inventing new ones.

2. **Select the gate matrix**
   - Foundation/docs: structure checks, lint/typecheck, link checks if available.
   - Backend/data: unit/integration tests, migration checks, security checks.
   - Frontend/UI: build, preview, route smoke, screenshot checks, accessibility, performance.
   - Regulated/sensitive projects: policy, vocabulary, PHI/PII/secrets scans.

3. **Run in the right order**
   - Fast static checks first.
   - Build next.
   - Runtime preview and browser checks last.
   - Stop and debug before collecting noisy downstream failures.

4. **Capture evidence**
   - Command, route/state, viewport, result, artifact path or URL, and timestamp.
   - Note skipped checks and why.

5. **Update trackers**
   - Attach or summarize evidence in PR and tracker rows.
   - Keep failures actionable: expected, observed, likely cause, next command.

## Output Template

```markdown
## QA Evidence
- Static checks:
- Build:
- Runtime smoke:
- Accessibility:
- Performance:
- Screenshots/artifacts:
- Skipped:
- Residual risk:
```

## Guardrails

- Do not claim manual smoke or visual parity without opening the rendered target or inspecting artifacts.
- Do not treat a flaky infrastructure failure as a product regression until logs prove it.
- Re-run only the smallest useful set after a fix.

