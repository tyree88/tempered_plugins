---
name: feature-verification
description: Verifies a new or changed product feature with evidence. It covers the CI gate, migration drift, a fixture-journey-receipts script harness, mobile and desktop screenshots, findings and release-proof docs, and an isolated newcomer panel that tests whether the feature is clear. Use when the user says "test this feature", "verify this works", "is this ready to ship", "prove it", "get screenshots", "run a focus group or panel", "is this clear to users", "release proof", or "smoke test", or when a feature is code-complete and needs evidence before merge or rollout.
---

# Feature Verification

Code-complete is not verified. Repository state is not production proof. Every claim needs a receipt: command output, a DB row, a screenshot path, or a human-recorded observation.

## Quick start

Read the project's CLAUDE.md, CI workflow, and package scripts. Run the same steps CI runs, in the same order, typically:

```bash
<pm> lint && <pm> typecheck && <pm> test && <pm> build
```

Then run any end-to-end suite and migration-drift check the project has. If CI does not run them, say so.

## Workflow

Copy this checklist into the task and tick it off as you go:

```
- [ ] 1. Gate: every CI step green locally
- [ ] 2. Unit tests cover the new logic (money, auth, and permission paths are mandatory)
- [ ] 3. DB: file-content test AND live or local proof that the change ran
- [ ] 4. Harness: fixture -> journey -> receipts scripts for the feature
- [ ] 5. Visual: screenshots at 390x844 mobile and 1280x800 desktop, saved under output/<feature>/<date>/
- [ ] 6. Findings doc filled (severity, file:line, fix, screenshot)
- [ ] 7. Clarity: newcomer panel verdicts plus DB-confirmed outcomes
- [ ] 8. Completion doc with Result, Verification receipts, and Not verified sections
- [ ] 9. Rollout: release-proof doc with human receipts (if it ships behind a flag or needs hosted config)
```

### 1-2. Gate and unit tests
- Keep tests next to the code. Cover every new branch, and give priority to paths that move money, grant access, or change state.
- Builds often skip test files, so make sure a typecheck covers them.

### 3. Database changes
- A test that string-matches migration SQL guards against later edits loosening it. It proves nothing is live.
- For live behavior, write a read-only probe script, or query a local stack. Ask the database what it applied (for example, its migrations ledger). Never write to production as an agent.

### 4. Script harness
Before you write new scripts, read any existing harness in the project. See [REFERENCE.md](REFERENCE.md#harness).
- `<feature>-fixture`: seeds synthetic users and data
- `<feature>-local` / `-proxy`: runs the app against a local backend
- `<feature>-journey`: clicks through the flow and screenshots each state
- `<feature>-receipts`: queries the database and asserts balances, rows, and side effects

### 5-6. Visual confirmation
- Run the dev server and open it in the browser pane. Take screenshots of every state: empty, loading, error, success, and after reload.
- Copy the findings skeleton from [REFERENCE.md](REFERENCE.md#findings). Severities: 🔴 BLOCK, 🟠 CRITICAL, 🟡 MAJOR, 🟢 MINOR.
- Accessibility: Lighthouse score per route, tab order, Esc closes panels, 44px hit targets, and reduced motion.

### 7. Clarity panel
See [REFERENCE.md](REFERENCE.md#panel). In short, spawn 3 isolated personas, each with a fresh 390x844 browser context, a minimal mission, and no source or prior reviews. Before they commit, each records what they understand. Then they give a GO or NO-GO, and the database independently confirms what they persisted.
- Label it "simulated agent usability evidence, not customer research".
- Fix repeated findings, then re-verify on a production build.

### 8-9. Write it down
- Completion doc: `docs/<feature>-<YYYY-MM-DD>.md`. Template: [REFERENCE.md](REFERENCE.md#completion).
- Release proof: status starts as **UNVERIFIED — HUMAN APPLY REQUIRED**. List the flags, the rollback order, and the receipts a human must record (deployed SHA, hosted config, one real end-to-end flow).
- Audits use the status vocabulary **PASS / PARTIAL / FAIL/DRIFT / UNVERIFIABLE**, and every row cites file:line or a live definition.

## Rules
- Never mark a step passed by assertion. Attach the output or the path.
- A skipped check is reported as skipped, not as passed.
- Log new failure modes wherever the project keeps its pitfalls or issues.
