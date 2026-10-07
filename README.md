# Tempered Plugins

This repository holds plugins from Tempered Works for AI coding tools. Four plugins are for Claude Code. One of them, multi-harness, is also a Codex plugin.

A Claude Code "mod" is a plugin of function hooks. A function hook is code that Claude Code runs when an event occurs, for example when a tool call ends. Three of the Claude Code plugins here are mods. multi-harness is a skills plugin. They run inside Claude Code, in the terminal and in the desktop Code tab.

## What is in this repository

| Folder | Tool | What it does |
|---|---|---|
| `ship-state/` | Claude Code | Shows the git, pull request, CI and deploy state of the current repo in one line above the prompt. |
| `timeline/` | Claude Code | Shows a vertical timeline of the work in a side pane: what you asked, what Claude did, and what each subagent is doing. |
| `limit-resume/` | Claude Code | Shows your usage limits and continues a turn after a rate limit resets. |
| `multi-harness/` | Claude Code and Codex | Gives Claude Code or Codex 6 skills to plan large work in waves and to track it to completion. |
| `.claude-plugin/marketplace.json` | Claude Code | Lists the 4 Claude Code plugins so that Claude Code can install them from this repository. |

## Why these plugins exist

**ship-state.** During a coding session, you often need to know if your work is pushed, if CI passed, and if production has the change. Without this plugin, you ask Claude, and Claude runs `git` and `gh` commands to find out. Each check costs a model turn. ship-state shows the answer on screen at all times and makes no model calls.

**timeline.** Long work with many steps and many subagents is hard to follow. Without a record, you ask "what is left?" and "what is the current goal?" many times. You also cannot see which model each subagent uses. timeline keeps one record per repo across sessions and shows it as a timeline.

**limit-resume.** When a session hits a usage limit, the work stops until you type "try again". If you are away, the session stays idle after the limit resets. limit-resume continues the work at the reset time. It also shows your usage before you reach the limit.

**multi-harness.** Large product work needs a plan, branch and pull request gates, tracker updates, QA evidence, and a safe closeout. multi-harness gives Claude Code and Codex a repeatable method for these steps. The method is the same for every product.

## Requirements

- Claude Code with support for function-hook plugins. We built and tested the plugins on Claude Code 2.1.286 on macOS.
- `git` 2.31 or newer.
- The GitHub CLI `gh`, signed in. ship-state and timeline use it for pull request, CI and deploy data. Without `gh`, they show only local git data.
- Production deploy data comes from GitHub deployment records. Vercel and most hosting services create these records.

## How to install the Claude Code plugins

Use one of these 2 methods.

**Method 1: install from the marketplace.** Run these commands in a Claude Code session:

```
/plugin marketplace add tyree88/tempered_plugins
/plugin install ship-state@tempered-plugins
/plugin install timeline@tempered-plugins
/plugin install limit-resume@tempered-plugins
```

Install only the plugins that you want.

**Method 2: load the folders directly.** Clone this repository. Then add the plugin folders to the `env` block of `~/.claude/settings.json`. Separate the folders with `:`.

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/tempered_plugins/ship-state:/path/to/tempered_plugins/timeline" } }
```

New sessions load the plugins. Sessions that are already open do not.

## How to use ship-state

ship-state needs no action. It starts with each session.

1. Look at the band above the prompt. It shows the current repo and branch.
2. Read the state from left to right:

```
app ⎇ feat/waitlist  ·  3 dirty  ·  ↑2 ↓0  ·  PR #312  ·  CI ⏳ 4/5  ·  prod = HEAD ✓ 2h ago
```

| Part | Meaning |
|---|---|
| `3 dirty` | 3 files have changes that are not committed. |
| `↑2 ↓0` | 2 commits are not pushed. 0 commits are not pulled. |
| `PR #312` | The branch has open pull request 312. |
| `CI ⏳ 4/5` | 4 of 5 CI checks are complete. |
| `prod = HEAD ✓` | Production runs the current commit. |

3. After a push or a merge, wait for the toast. ship-state shows "CI ✓", "CI ✗" with the failed check names, or "Live on prod".

ship-state follows Claude when Claude changes to another repo or worktree. It reads local git data every 20 seconds. It reads GitHub data every 5 minutes. After a push or merge, it reads GitHub data every 20 seconds for 10 minutes.

## How to use timeline

1. Type `/timeline` to open or close the pane. The pane also opens by itself when Claude logs the first task of a session.
2. Read the pane from top to bottom. The newest entry is at the bottom.
3. Read the left side for your requests and decisions. Claude writes each one as a one-line summary.
4. Read the right side for the work:
   - A task card shows a title, a progress bar such as `██████░░░░ 2/3`, how Claude did the step, and the next step.
   - Lines that start with `↳` show commits, pushes, pull requests and CI results for the active task.
   - A subagent card shows the agent type, the model, the status, and the elapsed time. It also shows the current tool call (`now:`), the next step (`next:`), the number of tool calls, the tokens, and the result.
5. Look for `⚠ no model set: inherited` on a subagent card. This warning means that the subagent uses the same model as the main session, because nothing set a model for it.
6. Hold the pointer on a card in the desktop app to see more detail.
7. If the timeline has more than 40 entries, use `◀ older` and `newer ▶` to move between pages.

How timeline works:

- The plugin adds a tool, `mcp__timeline__log`. It also adds an instruction of about 100 tokens that tells Claude when to log. Claude logs once for each change of direction, and once at the start, each step, the end, or a block of each task.
- Each subagent gets a shorter instruction to log its own progress.
- The log tool needs no permission prompt.
- timeline stores the history per repo in `~/.claude/timelines/<repo>-<hash>/`. Each session writes only its own files. Worktrees of a repo share one timeline.
- If 2 sessions work in the same repo, each pane shows the entries of the other session within 10 seconds.
- The desktop app draws the timeline as an image, with colors for light mode and dark mode. The terminal draws it as text. If the terminal is narrower than 70 columns, the text uses 1 column.

Usage cost: each logged entry costs approximately 40 to 80 output tokens. The instruction costs approximately 100 tokens in each session.

Privacy: the timeline files contain Claude's one-line summaries, the first 2000 characters of each subagent prompt, and commit subjects. The files stay on your computer.

Status: timeline is built and reviewed. Live testing is in progress.

## How to use limit-resume

limit-resume needs no action. It starts with each session.

1. Read the status line below the prompt. It shows your usage, for example `5h 62% · 7d 41%`. `5h` is the 5-hour window. `7d` is the 7-day window.
2. If the 5-hour usage reaches 85%, a toast tells you. Commit your work at this point.
3. If a turn stops because of a usage limit, the status line shows when the work continues. At the reset time plus 1 minute, limit-resume sends "Continue from where you left off".
4. If a turn stops because of a temporary API error, limit-resume tries again after 1, 2, 4, and 8 minutes, then every 15 minutes. It stops after 12 tries.
5. To cancel a pending continue, type any message.
6. To turn the plugin off or on, type `/autoresume off` or `/autoresume on`. Type `/autoresume status` to see the current setting.

Claude Code has a built-in setting, `autoContinueAtUsageLimit`, that also continues after a usage limit. Do not use the built-in setting and limit-resume together for usage limits. If you do, the turn gets 2 "continue" messages.

## How to use multi-harness

multi-harness has 2 manifests that share one `skills/` folder:

- Claude Code: `multi-harness/.claude-plugin/plugin.json`, plugin name `multi-harness`. It is in the marketplace file. Claude Code calls the skills `multi-harness:<skill>`, for example `multi-harness:platform-wave-orchestrator`.
- Codex: `multi-harness/.codex-plugin/plugin.json`, plugin name `platform-orchestrator`.

1. Install the plugin. In Claude Code, install `multi-harness` from the marketplace, or add the `multi-harness` folder to `CLAUDE_CODE_PLUGIN_DIRS`. In Codex, install the `multi-harness` folder with the Codex plugin installer.
2. Ask Claude Code or Codex to use Platform Orchestrator on a backlog. For example: "Use Platform Orchestrator to turn this backlog into shippable waves, branch and PR gates, tracker updates, and verification evidence."
3. Use the templates in `multi-harness/assets/templates/` for wave plans, tracker updates, QA evidence, and pull request closeout.

The 6 skills are:

| Skill | Use |
|---|---|
| `platform-wave-orchestrator` | Divide a backlog into agent lanes and implementation waves. |
| `platform-agent-patterns` | Choose how agents work together on a wave. |
| `platform-pr-closeout` | Gate and close branches and pull requests. |
| `platform-tracker-sync` | Update GitHub and Notion trackers. |
| `platform-qa-evidence` | Collect QA evidence for each change. |
| `platform-safety-review` | Review work that touches sensitive data, regulated text, or trust and safety limits. |

To check the folder structure, run `python3 multi-harness/scripts/check_plugin_structure.py`.

## Development

Each Claude Code plugin has checks for its logic. Node 23 or newer runs the `.ts` check files directly.

```
node limit-resume/check.ts
node ship-state/check.ts
bash timeline/checks/run.sh
```

To type-check timeline, do these 2 steps:

1. In a Claude Code session in this repository, run `/plugin-types .claude/types`. This command writes the Claude Code type declarations.
2. Run `tsc -p timeline/tsconfig.check.json`.

## License

MIT. See [LICENSE](LICENSE). Copyright 2026 Tempered Works LLC.
