---
name: state-sync
description: Periodic, read-first state-sync and drift auditor for ANY project. Reads .sync/config.yaml (sources, invariants, write policy) and produces a freshness-stamped drift report comparing trackers (Notion + GitHub issues) against deployed reality (Vercel + Supabase + live code via authenticated git). Auto-applies only mechanical, evidence-backed tracker fixes to canonical-verified targets; stages judgment calls; never edits code. Use when asked to "run a state sync", "check for drift", "reconcile the roadmap/issues with reality", or when a scheduled sync fires. Configure once with the `sync-setup` skill.
---

# State Sync & Drift Auditor (generic)

Triangulates whatever sources `.sync/config.yaml` declares, finds where trackers have drifted from what actually shipped, and reconciles the trackers — never the code. Project specifics live in config; this skill is the constant logic.

## 0. Load config first
Read `.sync/config.yaml` (search the project root and one level down). It defines: `report_dir`/`report_prefix`, `github` (repos, `issue_repo`, `secret_file`, `deploy_truth_branch`), optional `notion`/`vercel`/`supabase` blocks, `invariants_file`, `write_policy`, `vocabulary`, `marker`. If no config, run `sync-setup` first (or refuse and say so). Read `invariants_file` for the locked decisions to test against.

## Operating rules
1. **Deploy/DB is the freshest truth; `deploy_truth_branch` is production.** Rank freshness: Vercel deploy + Supabase live schema > `origin/<deploy_truth_branch>` (after an authenticated fetch) > local clone. Never read a clone as reality without fetching first. Treat `main` as production only if config says so.
2. **Freshness-stamp every source.** Unreachable → mark `UNAVAILABLE`, never fabricate. Partial-but-honest beats complete-but-invented.
3. **Workspace-scoping.** Before any Notion/GitHub write, verify the target against `notion.canonical_id_prefixes` and `github.issue_repo`. Wrong target → abort that write, log, continue.
4. **Write policy from config.** `write_policy.notion` / `write_policy.github_issues` decide auto vs stage. Default safe class = *mechanical only* (status flips backed by ≥2 sources; vocab/brand scrubs; stale-name fixes; close an issue only with a verifiable merged PR). Everything judgment-heavy → **stage** in the report. Honor `never_touch` (always includes code).
5. **Vocabulary gates** from `config.vocabulary` apply to everything written; run `forbidden` AND `brand_forbidden` greps **separately** (brand names slip a clinical-vocab gate). Grep the report itself before posting.
6. **Cite, don't claim.** Every finding names evidence: SHA / PR# / page ID / table / advisor / deployment ID.
7. **Secret:** read the token from `github.secret_file`; never echo or persist it. Missing/401 → degrade that source to `UNAVAILABLE`, stage its writes.
8. **No PHI / secrets** in the report. Schema shape + row counts only.

## Source recipes (parameterized; run only the configured blocks)
Resolve mounts portably — the session prefix changes each run:
```bash
ROOT=$(find /sessions/*/mnt -maxdepth 2 -name config.yaml -path '*/.sync/*' 2>/dev/null | head -1 | xargs dirname | xargs dirname)
TOK=$(cat "$ROOT/$(yq '.github.secret_file' ...)" 2>/dev/null)   # or parse config with grep/python
```
**Code (authenticated fetch, then compare):** for each `github.code_repos`, fetch with the token as a Basic header and compare to `origin/<deploy_truth_branch>`:
```bash
AUTH="Authorization: Basic $(printf 'x-access-token:%s' "$TOK" | base64 -w0)"
git -c "http.https://github.com/.extraheader=$AUTH" -C "$REPO" fetch origin --quiet   # benign "unable to unlink" warnings on mounted FS — fetch still succeeds (check exit 0)
git -C "$REPO" rev-list --count HEAD..origin/<branch>          # how stale the clone is
git -C "$REPO" log --oneline --merges HEAD..origin/<branch>    # what shipped in the window
git -C "$REPO" grep -niE '<forbidden|brand regex>' origin/<branch> -- <src path>   # drift, on the fetched tip not the stale tree
```
**GitHub issues:** `curl -H "Authorization: Bearer $TOK" .../repos/<issue_repo>/issues?state=open` (filter out PRs). Map open issues ↔ tracker items ↔ merged PRs.
**Notion:** verify prefix first. **Read small — large DBs/pages overflow the MCP response token cap** (the result dumps to a temp file the sandbox can't read). Query a *view* with a minimal display-property set, page small (`page_size` ~10-20), or fetch specific rows by ID; if still capped, **stage** the per-row work. **Posting the report:** if the parent is a wiki/database, use `notion-create-pages` with parent `data_source_id` + the DB's `title_property` — a `page_id` parent on a database id returns 404. Use `page_id` only for a plain page.
**Vercel:** `list_deployments` for each `vercel.projects` (teamId from config/`list_teams`); confirm the production promotion's branch == `deploy_truth_branch`.
**Supabase:** `list_tables` + `get_advisors(security)` for `supabase.project_id`. 0-row analytical tables = schema-only, NOT broken. Never read identity/PHI columns.

## Production-correctness self-grill (before finalizing)
Comparing against `origin/<deploy_truth_branch>` after a real fetch (not the stale tree, not `main`)? Is the deploy/DB newer than the branch — and did I treat it as truth? Did any "open" item actually ship (cross-check DB + merged PRs)? Are 0-row tables called schema-only, not broken? If the token was missing, did I mark GitHub `UNAVAILABLE` instead of guessing? Brand grep run separately from the vocab grep? Did the report itself pass the grep?

## Report format
Write `report_dir/<report_prefix><YYYY-MM-DD>.md` and (if Notion enabled) post it to `notion.report_parent`. Sections: §0 freshness stamps · §1 confirmed reality (≥2 sources) · §2 drift table (invariant | code | deploy/DB | tracker | verdict) · §3 applied this run (with evidence) · §4 staged for approval · §5 could-not-see.

## Pitfalls
Trusting the stale clone · reading `main` as prod when config says otherwise · bulk-fetching Notion (overflows — page small/by-ID) · wiki-DB post with a `page_id` parent (404 — use `data_source_id` + title prop) · brand names slipping the vocab grep · echoing the token · calling 0-row tables broken · posting a report that itself trips the vocab/brand gate.

## Related
`issue-reconciler` (consumes this report) · `sync-setup` (writes the config) · project `workspace-verification`-style skills for canonical-target checks.
