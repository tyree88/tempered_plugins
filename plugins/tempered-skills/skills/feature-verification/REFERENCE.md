# Feature Verification — Reference

## Harness

One script per role. Use the project's language and module style.

| Role | Does |
|---|---|
| Fixture | Seeds synthetic accounts, balances, and memberships. Writes the IDs to a gitignored runtime file. |
| Local or proxy | Starts or points the app at a local backend. Refuses to run against a remote host. |
| Journey | Drives a browser through the flow and saves a screenshot per state. |
| Receipts | Reads the runtime IDs, queries the database, and asserts the exact expected state. |
| Accessibility | Runs Lighthouse or axe per route and records the scores. |
| Live probe | A read-only query against the deployed database for one guarantee (RLS, guards, ledger). |

Conventions:
- Keep credentials and runtime IDs out of git, in a private runtime directory.
- Assert the target is local (for example `assert.equal(apiUrl, 'http://127.0.0.1:<port>')`). Validate every ID as a UUID before you put it in SQL.
- Receipts check the exact state: row counts, balances, one debit per action, and the persisted choice after reload.
- Write output to `output/<feature>/<slug>-<YYYY-MM-DD>/` (JSON receipts and PNG screenshots).

## Findings

```
- `path/to/component.tsx:LINE` — 🔴 BLOCK | 🟠 CRITICAL | 🟡 MAJOR | 🟢 MINOR
  **Surface**: <surface name>
  **Issue**: one sentence
  **Fix**: one sentence, the smallest change
  **Screenshot**: `output/<feature>/<surface>-<viewport>.png`
```

Sections: Mobile (390x844), Desktop (1280x800), Cross-cutting (tokens, motion, realtime sync), Accessibility.

| Check | Pass / Fail | Notes |
|---|---|---|
| Lighthouse a11y score per route | | |
| Tab order is sensible in panels and forms | | |
| Esc closes panels | | |
| Modals have `aria-labelledby` and trap focus | | |
| Hit targets are at least 44px | | |
| Reduced-motion path works | | |

## Panel

1. Pick 3 personas that match the real audience.
2. Give each one an isolated subagent with a fresh 390x844 browser context and a seeded synthetic account. Give them no source code, no earlier reviews, and no correct answers.
3. Give a minimal mission (for example: "create one item and complete the main action").
4. Before Submit, each records its understanding of role, cost, and deadlines (whatever the feature must make clear).
5. Each returns a verdict (GO / NO-GO) and its friction points.
6. The receipts script independently confirms what each persona persisted.

| Persona | Verdict | Understanding before commit | Persisted outcome (DB-confirmed) |
|---|---|---|---|

Then add: repeated findings → fixes applied → re-verified on a prod build. Record remaining feedback that is a product decision, not a defect.

## Completion

```md
# <Feature> — local completion

<Branch / worktree / base SHA. State plainly what was NOT pushed, merged, or deployed.>

## Result
<What changed for the user, by surface.>

## Fresh newcomer panel
<Panel table + caveat: simulated agent evidence, not customer research.>

## Verification receipts
- Gate: CI-step output
- Harness: receipts JSON path + key asserted values
- Screenshots: output/<feature>/...
- Accessibility: scores + manual checks

## Not verified
<Hosted migration, deploy, real users, payments, flag enablement — each listed explicitly.>
```
