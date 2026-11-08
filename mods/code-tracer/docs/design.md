# code-tracer — design

Date: 2026-11-07. Status: implemented; the pane as of 0.3.0 is Revision 3 at the end of this file. Mod folder: `tempered_plugins/mods/code-tracer/`.

## Problem

In a multi-agent session, code changes land from the main loop and from several subagents at once. The transcript shows tool calls, not code. To answer "what did agent X change, where, and why" you scroll, or you ask Claude, which costs a turn. Nothing tells you whether the session used the AI well or only made small, safe edits.

## Goal

A side pane that shows every code change of the session, tied to the code: the file and line range, the diff hunk, the agent that made it, the stated reason, and an ambition score with its signals visible. Zero model calls by default. Everything comes from events the engine already emits.

## Decisions

| Question | Decision |
|---|---|
| Data for diff + who | `tool.call` hook on `Edit`, `Write`, `MultiEdit`, `NotebookEdit`; after `await next(e)` the result carries `filePath`, `structuredPatch`, `gitDiff` (`additions`, `deletions`, `patch`) and the event carries `agentId`. `Bash` results carry `bashEditDiff` when a shell command wrote a file. No git calls per change. |
| Who is the agent | `agent.spawn` hook records `{ agentId, subagentType, description, model, parentAgentId }`. No `agentId` = main loop. |
| Why (v1) | The assistant text in the same step before the tool use, from `$.session.messages()` (last row with the tool use id in `toolUses`): first sentence, max 160 chars. Missing → the spawn `description` for a subagent, else `—`. Free, no behaviour change. |
| Why (v1.1, opt-in) | `userConfig.why: 'captured' | 'judged'`. `judged` runs `$.model.complete({ model: 'haiku' })` once per agent end over that agent's changes, returning one why per change and one judged signal line. |
| Ambition score | ~~Deterministic rubric from signals (below), 0–10, shown with its signals.~~ **Superseded by Revision 2.1: signed points, no quotient.** Never raw LOC. |
| Rendering | Native `Box` / `Text` / `Button` via `$.ui.resolve(e)`, one renderer for desktop and terminal. Pattern from `timeline/hooks/pane.tsx`. **Diff always stacked (Revision 2.1); the "diff beside meta" variant below is superseded.** |
| Persistence | `~/.claude/code-tracer/<repo>/<session>.jsonl`, one entry per change; reuse `timeline`'s `openStore` part-file approach. Survives reload (`$.state`) and session restart (files). |
| Export | `/code-tracer export` writes `code-tracer-<session>.md`: per agent → per change: path:lines, why, diff. A PR description seed. |

## Ambition score

> **Superseded by Revision 2.1** (end of file). Kept for history. Fields `score`, `sessionScore`, `AgentRow.score`, `importers` are removed; labels are renamed.

Ambition = scope of outcome relative to effort, not size of diff. Big diffs with no tests score low; small complete changes can score high.

Per **change**:

| Signal | Source | Points |
|---|---|---|
| New capability | patch adds `export`, `function`, `def`, `class`, a new route/handler/tool | +2 |
| Completeness | same agent also touched a test, fixture, config or caller of this file in this task | +2 |
| Reach | changed file imported by ≥3 files (`git grep -l <basename>` once per file, cached) | +2 |
| Behaviour, not cosmetics | hunk is not whitespace / rename / comment only | +1 |
| Stated why present | why captured, not `—` | +1 |
| Churn | same hunk range edited again by the same agent within the task | −1 each, floor 0 |
| Partial | `userModified` or a later revert of the hunk | −1 |

Per **agent** and per **session** ("how well did we use the AI"):

| Signal | Source |
|---|---|
| Leverage | edits ÷ reads (Read/Grep/Glob calls by that agent) |
| Autonomy | tool calls that ended in ask or deny ÷ total |
| Parallelism | subagents spawned that produced ≥1 change |
| Change score | mean of its changes' scores |

Shown as `6/10 · new capability · reach 4 files · no tests`. The number never appears without its signals. Scores are stored, so later sessions can compare.

## Pane layout

> **Superseded by Revision 2.1** (end of file). Kept for history.

Opened by `$.ui.open({ id: 'code-tracer', title: 'Code tracer' })` on the first change of a session; `/code-tracer` toggles it.

1. **Header**: `<repo> ⎇ <branch> · <changes> changes · <files> files · <agents> agents · session <score>/10`.
2. **Agents** (one row each, click = filter the feed): `▶|✓ <type or main> · <model> · <files> files +<a> −<d> · <score>/10`. Running agents first.
3. **Feed** (newest first, paged 20):
   ```
   14:02 ▶ test-engineer  src/auth/token.ts:41-58  +9 −3   7/10
   why  Expiry check used < so a token valid until :00 was refused at :00.
    -  if (exp < now) throw new Expired()
    +  if (exp <= now) throw new Expired()
   [more] [file]
   ```
   `more` expands the full hunk; `file` switches to the file view at this path.
4. **File view** (toggle in header): group by path. A path touched by ≥2 agents is marked `⚠ 2 agents` with both hunks' ranges: the live conflict signal. Overlapping ranges show in orange.

Colour only for state: running blue, done green, conflict orange, `+` green, `−` red. Width: `bodyColumns ≥ 70` wide (diff beside meta), else stacked.

## Data

### Change (`types/index.d.ts`, `$.state` `code-tracer.changes`)

> **Field list superseded by Revision 2.1 "Data"**: `score` → `points?`/`signals: Signal[]`, `importers` → `importerPaths?`, plus `test?`, `isReverted?`, `isDeleted?`, `isTooLarge?`, `spans`.

```ts
type Change = {
  id: string            // `<session>-<seq>`
  at: number
  agentId?: string      // undefined = main loop
  tool: 'Edit' | 'Write' | 'MultiEdit' | 'NotebookEdit' | 'Bash'
  path: string          // repo-relative
  hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }[]
  additions: number
  deletions: number
  why: string           // '' when none captured
  whySource: 'captured' | 'spawn' | 'none' | 'judged' // 'judged' only in v1.1 judged mode
  score: number
  signals: string[]     // human labels, e.g. 'new capability', 'no tests'
  importers?: number    // reach, filled lazily
  userModified: boolean
}
type Agent = { agentId: string; type: string; description: string; model: string; parentAgentId?: string; startedAt: number; endedAt?: number; reads: number; edits: number; asks: number }
```

### Modules (each pure except `register`)

| File | Job |
|---|---|
| `hooks/register.tsx` | hooks, store, pane open, command |
| `hooks/capture.ts` | tool result → `Change` (patch normalisation, bash diff, repo-relative path) |
| `hooks/why.ts` | messages → why sentence; spawn fallback |
| `hooks/score.ts` | signals and points; per-agent evidence counts |
| `hooks/reach.ts` | `git grep -l` importer count with per-path cache |
| `hooks/pane.tsx` | layout: header, agents, feed, file view |
| `hooks/export.ts` | markdown report |

### Hooks

> **Superseded by Revision 2.1 "Hooks"** (end of file): Bash results are inspected even when `isError`; `turn.start` is hooked; every tool call updates the agent's last action.

- `tool.call` on edit tools and Bash: `const r = await next(e)`; if `!r.isError && r.result` → `capture` → `why` → `score` → append + `update(changes)`. Also counts reads/asks per agent for leverage.
- `agent.spawn`: record `Agent` (`await next(e)` gives `agentId`).
- `turn.complete` with `agentId`: mark `endedAt`; in `judged` mode run the judge once.
- `session.start`: `$.command.register({ name: 'code-tracer' })`; load store.
- `command.run` `code-tracer`: no arg = toggle pane; `export` = write report, toast the path.
- `ui.render` `Pane` `requestId: 'code-tracer'`.
- `session.end`: flush.

## Error handling

A hook that fails is skipped and the tool still runs; the tracer never gates a call, so no `.catch` guard is needed, but every hook calls `next(e)` first and catches its own work so a tracer bug can never deny an edit. Unreadable store part → new part (timeline pattern). `git grep` failure or an extension without an import pattern → no `importerPaths`, label `reach unknown`. Judge failure → fall back to captured why, label `judge failed`.

## Testing

> **Second bullet superseded by Revision 2.1**: assert `points ≥ 5` with signals `adds export parse` and `test touched src/parse.test.ts`.

`hooks/register.test.tsx` with `claude plugin test`:
- Edit call by a spawned agent → one change with that `agentId`, hunks from `structuredPatch`, why from the preceding assistant text.
- Write of a new file with `export function` and a test file in the same task → score ≥ 7 with `new capability`, `completeness`.
- Same hunk edited twice → churn −1.
- Two agents editing one path → file view marks `⚠ 2 agents`.
- Pane mounts on `['terminal', 'desktop']`.
Pure modules (`score`, `why`, `capture`) get table tests. Gate: `claude plugin validate`, `tsc -p`, `claude plugin test`.

## Out of scope (v1)

Opening a file in the editor from the pane; import-graph blast radius beyond importer count; cross-session comparison UI; judged mode (v1.1); conflict prevention (warn only, never deny).

## Approaches considered

- **A. Passive tracer** (chosen): hooks only, captured why, rubric score. Cheapest, zero tokens, honest signals.
- **B. A + judge**: haiku summarises why and judges ambition per agent end. Better prose, costs tokens, adds latency at agent end. Shipped as the `judged` toggle in v1.1.
- **C. Intent contract**: register `mcp__code-tracer__intent` and inject a `prompt.compose` rule so agents state intent before editing (the `timeline` pattern). Most precise why, but changes agent behaviour and costs a call per edit batch. Revisit if captured why is empty for >30% of changes.

## v2 idea (maintainer, 2026-11-07): the reflector

For long runs, a recursive agent that back-propagates over the work completed and feeds improvements forward. In code-tracer terms: on each `turn.complete` of the main loop (or every N changes), a background subagent reads the session's `Change` log and scores, looks for low-ambition or incomplete changes (no tests, cosmetic, churn, low reach), and writes one `improvement` row per finding: `{ changeId, suggestion, kind: 'tests' | 'callers' | 'scope' | 'cleanup' }`. The pane shows them under the change; a `prompt.compose` section feeds the open ones to the next step as "pending improvements from the reflector". A finding is closed when a later change touches its target. Cost: one haiku call per cycle, opt-in. Builds on upgrades 1 and 2 of the ambition list; needs the stored `points` and `signals` v1 produces.

---

# Revision 2.1 — visualization (focus-group review, 2026-11-07)

Status: verified conditional. Three adversarial passes; no blocker open. Items marked (post-VF) were applied by the orchestrator after the last verifier pass and are inspected, not independently verified: VF-28, VF-25 residual, VF-29, VF-30, context-line trim, T default, summary regex. Supersedes the Decisions rows marked above, "Ambition score", "Pane layout", the `Change`/`AgentRow`/`View` fields and the Testing bullets they imply. Finding IDs: OP operator, CR code reviewer, ID information designer, VF adversarial verifier.

## What the pane must answer, in order

1. Did two agents touch the same code? (conflict)
2. What is each running agent doing right now, and for how long? (present)
3. For each change: who, where, what, why, and is there evidence it works? (record)

Every drawn element anchors to a path, a line span or a hunk, except header and agent-row counts, which count such rows (CR-1, VF-14).

## Ambition: a signed sum with its signals, never a word, never a quotient (CR-1, CR-2, VF-15, VF-16)

Each change carries `points?: number` and `signals: Signal[]`, `Signal = { label: string; pts: number }` (`pts` may be 0 for a flag). The pane draws one wrapped line per change, penalties first:

```
ambition +3   −1 churn ×1 · +2 adds export createToken · +1 behaviour · +1 why · ⚠ signature changed createToken · imported by 4
```

No bucket word (VF-16: any merit word reads as a grade). Header and agent rows never carry `points`; they carry evidence counts written with "of", never a slash (VF-15): `tests ran after 4 of 23`. Unscored rows (deleted, too large) have `points` undefined and `signals: []`.

| Signal | Detection | pts |
|---|---|---|
| `adds export <name>` | a `+` line that is a top-level declaration. `name` = the first `\w+` captured: `^\+(export\s+(default\s+)?)?(async\s+)?(function|class|interface)\s+(\w+)`, `^\+(export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\(.*\)\s*=>`, `^\+def\s+(\w+)`, `^\+(pub\s+)?fn\s+(\w+)`, `^\+func\s+(\([^)]*\)\s*)?(\w+)`, routes `^\+\s*(app|router|r)\.(get|post|put|patch|delete|use)\(` (name = the path literal), `^\+\s*\$\.(tool|command)\.register\(` (name = the `name:` literal). Not in test paths or `.md` (CR-4, VF-17). | +2 |
| `test touched <path>` / `caller touched <path>` / `config touched <path>` | another change by the same agent in this session that names this file: path match = the stem as a whole path segment or `stem.(test|spec)`; hunk-text match = `\bstem\b` inside an import/require/from/use line or a call `stem(`. Stems shorter than 3 chars or in the stop list (`index main app utils types config lib`) match by path only. Rescored over the agent's whole session on every append (CR-3, VF-9). | +2 test or caller, +1 config |
| `imported by N` | per-extension pattern, stem regex-escaped: `.ts .tsx .js .jsx .mjs .cjs` → `['"/]stem(\.[cm]?[jt]sx?)?['"]`; `.py` → `(from|import)\s+[\w.]*\bstem\b`; `.rs` → `::stem\b`; `.go` → files in the same directory plus `git grep -l '"<module>/<dir>"'`; `index.*` stems use the directory name, except directory names in the stop list (`types utils lib src app`), which get `reach unknown`. Any other extension → `reach unknown` (no points). `importerPaths` stored (cap 10), listed under `more`. Excludes the file and test paths (CR-5, VF-8). | +2 when N ≥ 3 and the change is not cosmetic |
| `behaviour` / `cosmetic` | stripped `-` lines equal stripped `+` lines → cosmetic. `#` stripping only for `.py .rb .sh .yml .yaml .toml .mk`. No rename detection (CR-13). | +1 / 0 |
| `why` | `whySource === 'captured'` only. `task` (spawn description) earns nothing (CR-10). | +1 |
| `✓ tested <runner>` / `✗ tested <runner>` / `? tested <runner>` / `✓ checked <runner>` / `✗ checked <runner>` | A Bash call whose command has a runner as the first word of a pipeline segment after an optional prefix `((\w+=\S+|time|env)\s+)*(npx\s+|pnpm\s+((exec|run|-r|--filter\s+\S+)\s+)?|yarn\s+(run\s+)?|bunx?\s+|python3?\s+-m\s+|uv\s+run\s+|poetry\s+run\s+)?`. Test runners: `vitest|jest|mocha|pytest|cargo\s+test|go\s+test|bun\s+test|node\s+--test|(npm|pnpm|yarn)\s+(t\b|((run|-r|--filter\s+\S+)\s+)?test(:\S+)?\b)|claude\s+plugin\s+test`; the package-manager form is matched before the prefix is consumed (post-VF, VF-25). Check runners: `tsc|eslint|cargo\s+(check|build)|npm\s+run\s+(check|build|lint)|pnpm\s+(check|build|lint)|claude\s+plugin\s+validate`. `runner` = the matched word(s), ≤ 12 chars. Results are inspected even when `isError` (VF-22); only `interrupted` or absent results are skipped. Outcome: the Bash result has no exit code (engine `Bash` result = `stdout, stderr, interrupted, returnCodeInterpretation?`). Status is direct only when nothing follows the runner segment, or only `&&`-chained segments follow: `✓` = `!isError`, `✗` = `isError`. Any `;`, `|` (without `set -o pipefail`) or `||` after the runner makes the status unreliable (post-VF, VF-28): read stdout for a summary (vitest/jest `Tests\s+[1-9]\d* failed|Test Files\s+[1-9]\d* failed` → ✗, `\d+ passed` with no non-zero `failed` → ✓; pytest `[1-9]\d* failed` → ✗ / `\d+ passed` → ✓; go `^FAIL` → ✗ / `^ok` → ✓; cargo `test result: FAILED` → ✗ / `test result: ok` → ✓); no summary → `? tested <runner>` (dim, 0 pts) (VF-24). Two fields, `test?` and `check?`, each replaced only by a later run of its own kind (VF-23). Attachment: to changes whose path is a code file (not test, not config), by the same agent, made after that agent's previous run of that kind; main's runs attach to main's changes, and to an ended subagent's changes since that subagent's last run. `testsAfter` counts `test` with ✓ or ✗ only. `reverted` rows get none (CR-6, VF-6, VF-7, VF-25). | tested ✓ +2, ✗ 0 (red, cause unknown), ? 0; checked ✓ +1, ✗ 0 |
| `⚠ signature changed <name>` | a `-` and a `+` line both matching `(function|def|fn|func)\s+(\w+)\s*\(` or `^\s*(export\s+)?(const\s+)?(\w+)\s*[=:]?\s*(async\s*)?\([^)]*\)\s*(=>|\{|:)` with the same name and different text; forces the importer list open (CR-11; the second form covers arrow consts and class methods, VF open issue). | 0 (flag) |
| `churn ×N` | a later hunk by the same agent intersects an earlier hunk of the same path after span rebasing (below) (CR-7, VF-5). | −1 each |
| `reverted` | later change on the same path whose `+` set equals this change's `-` set and whose `-` set equals this change's `+` set after stripping, both sets non-empty; or a Bash `git (checkout|restore)\b` naming the path. Row drawn dim (CR-6, VF-7e). | −2 |
| `edited by you` | `userModified` (ID-10). | 0 (flag, warning colour + text) |
| `no tests` | path is a code file, not a test path, not a config path, and the change has no test signal (`isTestPath` excludes `*.test.*`, `*.spec.*`, `test/`, `tests/`, `__tests__/`, `spec/`, `fixtures/`, `checks/`) (CR-13, VF-10). | 0 (deficit label) |
| `diff too large` / `deleted` | result had no hunks but `gitDiff` counts, or `bashEditDiff.files[].deleted`. Row shown, unscored, `deleted` in error colour (CR-8). | — |

**Span rebasing (VF-5, VF-21).** `newStart` is a line number in the file as it was after that edit. To bring every span on one path to current lines: for each hunk H in time order, take every later hunk L on the same path in time order; compare `L.newStart` with H's already-shifted `from`; L is "above" when `L.newStart < from`, or `L.newStart <= from` and L is a pure insertion (`oldLines === 0`): shift `from` and `to` by L's delta (`newLines − oldLines`); when L is a deletion whose old range covers H's start, set `from = L.newStart` and shift `to`; otherwise, if L intersects the shifted span, record churn (same agent) or overlap (another agent) and shift `to` by L's delta; else leave it (post-VF, VF-30). Spans are trimmed to their first and last `+`/`-` line before rebasing, so two edits that share only context lines do not intersect (post-VF). Overlap between two agents is the intersection of their rebased spans. Stored spans stay as captured; rebasing is a pure function at draw time. Test cases: three-step insertion case → overlap `50-58`; its mirror → none; two later insertions above (case A) → overlap `70-73`; a true overlap followed by an unrelated insertion above (case B) → overlap `55-60`. The file view heading says `lines as of now`.

**Path normalisation (VF open issue).** Every captured path (`Edit.filePath`, `Write.filePath`, `bashEditDiff.files[].filePath`) is resolved against the session cwd, `./` and `..` segments removed, then made repo-relative. One file = one key.

Per-agent and header evidence counts (CR-1, CR-12, VF-14): `N changes · tests ran after a of N · b no why`, plus `c reverted · d shared files` when non-zero; `noWhy` = `whySource !== 'captured'`. Raw activity (`3 edits · 7 reads · 2 asked`), model and description are dim trailing tokens, not counts of rows, and truncate first. Autonomy and Parallelism rows are removed from v1.

## Layout

Fixed columns from the left: time 5, space, glyph 1, space, tag T, two spaces. T = 12 below 90 columns, 18 at or above, fixed per session at first render; before the first render T = 12, and a tag is only ever re-cut shorter (VF-4, post-VF). The path gets the rest of the line and never less than 20 cells; when the line cannot hold prefix + 20 + the trailing tokens, the trailing tokens move to a sub-line (VF-1, VF-2). Feed sub-lines indent 6; AGENTS sub-lines indent under the button (18). Diff always stacked (ID-7).

**Path ellipsis (VF-3, VF-20).** Middle ellipsis: keep the first segment and at least the last two (`app/…/settings/page.tsx`). When two rows on screen would still render identically, both keep one more trailing segment. When the area is too short, in this order: (1) the first span is never dropped; (2) drop the first segment (`…/settings/page.tsx`); (3) ellipsize inside the penultimate segment (`…/sett…/page.tsx`); (4) ellipsize inside the file name keeping the extension (`…/Notification…ces.tsx`). Disambiguation widens within these steps, never below them. The same function serves the feed, the file view, the `last` target (budget 24) and a path filter in a heading (budget `columns − 20`).

**Agent tag (ID-5, OP-3, OP-10, VF-4, VF-19).** `main`, else `subagentType` with any `<plugin>:` prefix stripped, cut to T. Collisions are computed on the drawn strings: every colliding tag after the first replaces its last 2 characters (3 from `#10`) with `#N`, N from 2 by spawn order; a lone tag has no suffix. `tagsFor(['test-engineer'], 12)` → `test-enginee`; `tagsFor(['test-engineer','test-engineer'], 12)` → `test-enginee`, `test-engin#2`. Stored as `Agent.tag` at spawn and copied to `AgentRow.tag`; persisted with the agent row; a persisted tag longer than the session's T is re-cut on load; `#N` counters continue from stored agents. The description is a trailing dim token only.

**Agent state (VF-11, VF-26, VF-27).** Main: `▶ running` from `turn.start` without `agentId` (an engine hook; fallback if ever absent: the first main `tool.call` after a `turn.complete`) until its `turn.complete`, else `· idle`; never `done`. `session.end` of any reason sets main `· idle` and clears elapsed. Subagent: `▶ running` from spawn; `✓ done` on its `turn.complete`; any later `tool.call` or `tool.check` carrying its `agentId` clears `endedAt` (continued via SendMessage). `running Nm` becomes `1h12m` past 60 minutes.

**Last action (OP-6, VF-12).** Every `tool.call` by an agent sets `lastAt`, `lastTool`, `lastTarget`: Edit/Write/Read → the path (middle-ellipsized to 24); Grep/Glob → `pattern`; Bash → `Bash` + the command with a leading `cd … &&` stripped, cut to 24; Agent/Skill → the subagent type or skill. Bash commands whose first word is `grep rg find ls cat head tail sed awk` count as reads; Grep and Glob are not registered on the native macOS build, so this is the common read path there.

**1 · Header** (ID-9, OP-11, CR-14, VF-1), below 90 columns three lines, else one:
```
23 changes · 9 files · 5 agents (1 running)
tests ran after 4 of 23 · 2 no why · 1 reverted
tempered_plugins ⎇ feat/code-tracer
```
Line 1 bold, lines 2–3 dim. At 60 columns every line fits (≤ 46 cells).

**2 · Conflict strip** (OP-1, ID-1), only when non-zero, directly under the header, one row Box with the Text then the Button:
```
⚠ 2 shared files · 1 overlap   [show]
```
`[show]` sets mode = files, clears filters. `⚠` is cell 0; `warning` colour on the mark text only. ≤ 40 cells.

**3 · Agents** (OP-6, ID-3, ID-4, ID-13, VF-1, VF-11, VF-12, VF-14), below 90 columns: line 1 button, state, elapsed, change count; line 2 last action; line 3 (dim) evidence counts then activity, model, description. At or above 90 columns lines 1 and 2 join. Lines 1 and 2 ≤ 60 cells; line 3 holds the counts, ordered so the conflict count survives truncation, then the dim tail (post-VF, VF-29):
```
AGENTS
[● test-enginee]  ▶ running 11m · 3 changes
                  last 14:02 Edit app/…/auth/token.ts
                  2 shared · 1 reverted · tests ran after 1 of 3 · 1 no why · 3 edits · 7 reads · haiku · write expiry tests
[○ main]          ▶ running · 9 changes
                  last 14:03 Bash pnpm test
                  tests ran after 9 of 9 · 0 no why · 9 edits · 12 reads · opus
[○ reviewer]      ✓ done · 0 changes
                  last 13:58 Bash rg tokenExpiry
                  3 reads · haiku · review the auth module
```
Button label = `●`/`○` + tag only. Running agents first. `d shared · c reverted` lead line 3 and appear only when non-zero. After three done agents the rest collapse into one row `+5 done  [show all]`. Line 3 truncates from the right, so the counts stay and the description goes first.

**4 · Feed** (ID-2, ID-6, ID-10, ID-11, ID-12, OP-5, OP-12, CR-10, VF-1, VF-2, VF-3), below 90 columns:
```
CHANGES · test-enginee  [clear]
◀ older   2 of 3   newer ▶
14:02 ▶ test-enginee  app/…/auth/token.ts:41-58, 70-72
      +9 −3 · ✓ tested vitest · new
      ambition +5   +2 adds export createToken · +2 tested vitest · +1 behaviour · imported by 4
      why   Expiry check used < so a token valid until :00 was refused.
      - if (exp < now) throw new Expired()
      + if (exp <= now) throw new Expired()
      [more (+8)] [file]
```
At or above 90 columns the counts and test token join the meta line and the paging row joins the heading. Meta line: time, the agent's state glyph (`▶` blue while running, `✓` after, `✎` appended when user-modified), tag, path with one span per hunk (narrow: first span then `+1 hunk`). Trailing tokens: counts, `✓ tested <runner>` (success) / `✗ tested <runner>` (error) / `✓ checked <runner>`, `new` (success) for a created file. Ambition line wraps. Why line: `why ` (captured) / `task ` (spawn) / `why —` (none), label dim. Collapsed diff = first `-` and first `+` line. Expanded: every hunk with a dim `@@ 41,6 → 41,12` header. `[file]` sets mode = files with this path first. A heading with a filter shows `[clear]`; a path filter shows the path ellipsized to `columns − 20`. `2 of 3` dim between the paging buttons, on its own row below 80 columns (VF open issue). Deleted or too-large rows: meta line only, `deleted` in error colour or `diff too large` dim, no ambition line.

**5 · File view** (OP-2, OP-4, ID-1, CR-7, VF-5, VF-13):
```
FILES · lines as of now                 [by change]
⚠ 2 agents · overlap 50-58  app/…/auth/token.ts
      ▶ test-enginee    41-58⚠, 70-72   last 14:02
      ✓ main           50-61⚠          last 13:58
  1 agent                               src/auth/index.ts
      ✓ main           1-12            last 13:51
```
Built from all changes even under an agent filter; the filter hides only rows that agent did not touch (OP-2). One sub-line per agent per file: tag, that agent's rebased spans, last edit time. A span that intersects another agent's span carries a trailing `⚠` and `warning` colour (VF-13). The path is a Button: press → feed filtered to that path. Rows sort: overlap first, then agent count, then last edit. Paged at 30 rows with the same paging controls as the feed.

## Glyph and colour rules (ID-3, ID-4, ID-13, VF-13)

Colour carries four states, each with a glyph or word beside it: `blue` running (`▶ running`), `success` added lines, `new`, `✓ tested/checked`; `error` removed lines, `deleted`, `✗`; `warning` `⚠` overlap marks and `edited by you`. Done is `✓` in the default colour. `dimColor` is never the only difference between two states.

| State | Glyph | Colour | Text |
|---|---|---|---|
| agent running | ▶ | blue (glyph + word) | running Nm |
| agent done / main idle | ✓ / · | default | done / idle |
| user-modified change | ✎ | default | edited by you (signal, warning) |
| new file | new | success | new |
| added / removed / context line | + / − / space | success / error / dim | the sign |
| hunk header (expanded) | @@ a,b → c,d | dim | numbers |
| file: 1 agent | — | dim | 1 agent |
| file: ≥ 2 agents, disjoint | ⚠ | default | 2 agents |
| file: spans intersect | ⚠ on row and on each span | warning (mark text) | overlap 50-58 |
| why captured / from task / none | why / task / why — | dim label | sentence |
| test or check run | ✓ / ✗ | success / error | tested vitest · checked tsc |
| filter on / off | ● / ○ | default | button label |

Glyph widths: `⚠ ▶ ● ○ … ⎇ −` are ambiguous-width in some terminals. Column arithmetic assumes one cell; a `userConfig.ascii` option swaps `! > * o ... = -` (deferred, noted).

## Data

`Agent`: `tag`, `lastAt?`, `lastTool?`, `lastTarget?`; `endedAt` cleared on later activity. `Change`: `points?: number`, `signals: Signal[]`, `spans: Span[]` (one per hunk, as captured), `importerPaths?: string[]`, `test?: { runner: string; ok: boolean | null; at: number }`, `check?: { runner: string; ok: boolean; at: number }` (`ok: null` = outcome unknown), `isReverted?`, `isDeleted?`, `isTooLarge?`; `score` and `importers` removed; `whySource: 'captured' | 'spawn' | 'none' | 'judged'` (`judged` only in v1.1). `AgentRow`: `tag`, `state: 'running' | 'done' | 'idle'`, `elapsedMs?`, `last?: { at: number; tool: string; target: string }`, `evidence: Evidence`, `activity: string`; `score` and `leverage` removed. `View`: `conflicts: { files: number; overlapping: number }`, `evidence: Evidence`, `pathFilter?`, `focusPath?`, `tagWidth: 12 | 18`, `filePage`, `filePages`; `sessionScore` removed. `Evidence = { changes: number; testsAfter: number; noWhy: number; reverted: number; sharedFiles: number }`. Store: one JSONL per session holding `Change` rows and `Agent` rows (`kind` discriminator); the file is rewritten whole on each append because rescoring edits earlier rows. A `/clear` starts a new part `<session>-<n>.jsonl` (timeline pattern) so pre-clear rows survive; agents and their `#N` counters are read from all parts.

## Hooks (replaces the v1 list)

`session.start` (ids, repo, store parts, command); `session.end` (main idle; `clear` → new part); `agent.spawn` (Agent row with tag); `turn.start` / `turn.complete` with and without `agentId` (main running/idle, subagent done); `tool.check` (asks; clears `endedAt`); `tool.call` on every tool (`lastAt/lastTool/lastTarget`; reads incl. Bash read verbs; edits; Bash runner detection even when `isError`; Edit/Write/MultiEdit/NotebookEdit capture on `!isError`; Bash `bashEditDiff` capture); `command.run`; `ui.render`. All gating hooks carry `.catch(($, e, next) => next(e))`.

## Deferred

- Desktop Svg lane strip under an overlap row (ID). - `hide diffs` toggle (OP-9). - Rename detection (CR-13). - `userConfig.ascii` glyph fallback (VF). - Midnight rollover of `HH:MM` (show date prefix when the session spans a day).

## Verification plan

Table tests (pure): the five declaration forms give `adds export <name>` with the right name and the five CR-4 false positives give none; config edit then unrelated edit → no completeness; implementation then test → rescored `test touched <path>`; `src/auth/index.ts` + a test editing `arr.indexOf` → no completeness, + a test importing `'../auth'` → `test touched`; the three-step VF-5 counterexample → overlap `50-58`, its mirror → none; two hunks at 10 and 400 vs one at 200 → none; the fifteen VF-6 commands → true only for the eight real runners; README + token edit + `vitest token` → README has no test signal; ✗ then ✓ → change shows ✓, counted once; pure add then pure delete → not reverted; `token.test.ts` change → neither `no tests` nor `test touched`; import patterns per extension against the eleven VF-8 sample lines; `tagsFor(['agent-protocols:code-reviewer','agent-protocols:test-engineer','general-purpose','general-purpose'], 12)` → four distinct 12-cell tags; `ellipsize` of two `page.tsx` paths at 20 cells → distinct strings.

Render tests at 60, 70, 90 columns, colours stripped: header lines each ≤ columns; conflict strip present with two agents on one file and absent otherwise, `⚠` at index 0; feed meta line ≤ columns with ≥ 20 cells of path and the test token present on the line or its sub-line; two same-type agents show two tags identical across AGENTS, feed and file view; filtered file view still shows `⚠ 2 agents`; a running agent with only Bash calls shows `last … Bash rg …`; main shows `▶ running` during a turn and `· idle` after; the intersecting span carries `⚠` in text; the rendered header and agent lines with 10 changes and 4 tests contain no `/\d+\/10\b/` (path text is excluded from this assertion).

## Revision 3 — cards (2026-11-07, maintainer)

The maintainer, after the live self-test: "strip back a lot of this and just have a 2 column view of wrapped code then on the right the explainable Why, What can we do with this, How it works. Also include a container surrounding the elements for better scroll navigation, with agent color coding." Decisions (asked once): cards only, no AGENTS strip and no FILES view; the right column is derived, no model call.

- Pane: header (counts, repo ⎇ branch), conflict line, a legend of agent buttons in their colours, then one framed container (`Box borderStyle="round"`, dim) holding the cards with the paging row at its top.
- Card: `Box borderStyle="round" borderColor=<agent colour>`; head line `HH:MM ■ tag  path:lines` + `this file` button; marks line (`+a −d`, run tokens, `new`, `reverted`, `edited by you`); body `row` at ≥ 70 inner columns (code `width="55%"`, explanation `flexGrow`), else `column`.
- Code column: every hunk, `@@` header dim, lines `mono wrap="wrap"` coloured `diffAdded` / `diffRemoved`; 8 lines then `more (+N)` / `less`.
- Explanation column (`hooks/explain.ts`, pure): `Why` (captured / `Task` / `—`), `How it works` (`howOf`: new file, declarations, signature changes, edited spans, cosmetic, importers), `Next steps` (`nextOf`, commands: failing run, other agents on the file and the overlap, callers to update, test to run, user edit to review, missing why; else "nothing pending").
- Colours: `tags.ts colorFor(id, spawnIndex)` → `text` for main, else the theme keys `claude, suggestion, permission, planMode, autoAccept, remember, ide, merged` in spawn order. `success`/`error`/`warning` stay reserved for run outcomes and conflicts.
- `View`: `legend: Legend[]`, `explained: Record<id, { how, next }>`, `fileRows` kept for the shared-file mark; `agents` (AgentRow), `evidence`, `mode`, `focusPath`, `filePage(s)`, `hiddenDone` removed. `agentRows` and `AgentRow` deleted from score.ts. Ambition points stay in the store and the export only.
- Found while testing: the test kit's `ui.find({ key })` addresses `Box` and `Button` keys, not `Text` keys; `fs.write` events carry `text` (the mock read `data`). `$.session.messages()` returns one row per content block, and some model messages have no text row at all; `whyOf` walks back over the message's own consecutive assistant rows only and stops at the first user row, so a missing sentence shows `—` rather than an earlier message's sentence.
- Why fallback (maintainer, same day, after 19 of 51 whys came back empty): a subagent takes its spawn description (`spawn`); main takes the first sentence of the latest user prompt before the call, host blocks such as `<system-reminder>` stripped (`prompt`). Both draw as `Task`; neither earns the `why` point. `none` only when no prompt exists.
