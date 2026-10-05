# Tempered Plugins

Claude Code mods from Tempered Works. Each one is a plugin of function hooks: it runs inside Claude Code (terminal or the desktop Code tab), draws on screen, and makes no model calls of its own unless noted.

| Plugin | What you see | Usage cost |
|---|---|---|
| [ship-state](#ship-state) | A band above the prompt: branch, dirty files, ahead/behind, PR, CI, production deploy. A toast when CI finishes or prod goes live. | None |
| [timeline](#timeline) | A side pane with a vertical timeline: your asks and decisions on the left, Claude's milestones with progress bars and live subagent cards on the right. | A few output tokens per logged milestone |
| [limit-resume](#limit-resume) | A status line with 5-hour and 7-day usage. Resumes a turn cut off by a rate limit or API error once it clears. | None |

## Install

As a marketplace:

```
/plugin marketplace add <owner>/tempered_plugins
/plugin install ship-state@tempered-plugins
```

Or load folders directly, without a marketplace, by setting `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` to a `:`-separated list of plugin folders:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/tempered_plugins/ship-state:/path/to/tempered_plugins/timeline" } }
```

New sessions pick it up.

## Requirements

- A Claude Code build with function-hook plugins ("mods"). Built and tested on 2.1.286, macOS.
- `git` 2.31 or newer.
- For CI, PR and deploy information: the GitHub CLI (`gh`), signed in. Production deploys come from GitHub deployment records, which Vercel and most hosts create.

## ship-state

A one-line band above the prompt for the repo the session works in. It follows Claude's `cd` into another repo or worktree.

```
app ⎇ feat/waitlist  ·  3 dirty  ·  ↑2 ↓0  ·  PR #312  ·  CI ⏳ 4/5  ·  prod = HEAD ✓ 2h ago
```

- Local git state refreshes every 20 s and after git commands.
- GitHub state refreshes every 5 minutes, and every 20 s for 10 minutes after a push or merge.
- Runs only `git` and `gh`. No model calls.

## timeline

A pane (`/timeline` toggles it) showing a vertical line that grows downward:

- **Left:** what you asked or decided, as a one-line summary Claude logs.
- **Right:** work milestones with progress bars (`██████░░░░ 2/3`), with commits, pushes, PRs and CI results under the active card.
- **Subagents:** live cards with type, model (`(pinned)` or `⚠ no model set`), status, elapsed time, `now:` (the current tool call), `next:`, tool count, tokens, and the result.

How it works:

- The plugin adds a `mcp__timeline__log` tool and a short instruction (about 100 tokens) telling Claude when to log: once per change of direction, and at task starts, steps, finishes and blockers. Subagents get a shorter note. The tool needs no permission prompt.
- History is per repo, across sessions and worktrees, in `~/.claude/timelines/<repo>-<hash>/<session>.jsonl`. Each session writes only its own files. A second session in the same repo shows up within 10 s.
- The desktop app draws an SVG with hover details and light and dark palettes. The terminal draws text, which collapses to one column below 70 columns.

Privacy: entries hold Claude's one-line summaries, subagent prompts (the first 2000 characters), and commit subjects. They stay on your machine.

Status: built and reviewed, live testing in progress.

## limit-resume

- A status line: `5h 62% · 7d 41%`, and a toast at 85% of the 5-hour window.
- When a turn dies on "You've hit your session limit", it waits for the reset and sends "continue from where you left off". On a 529 or a transient API error it retries after 1, 2, 4… minutes, up to 15.
- `/autoresume on|off|status`. Typing anything while a resume is pending cancels it.

Note: Claude Code has a built-in `autoContinueAtUsageLimit` setting for usage limits. Use one or the other for limits, not both, or the turn gets two "continue" messages.

## Development

Each plugin's pure logic has Node checks (Node 23 or newer runs `.ts` directly):

```
node limit-resume/check.ts
node ship-state/check.ts
bash timeline/checks/run.sh
```

To typecheck `timeline`, write the engine's type declarations into this repo with `/plugin-types .claude/types` from a Claude Code session here, then run:

```
tsc -p timeline/tsconfig.check.json
```
