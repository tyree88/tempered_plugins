# Tempered Plugins

This repository holds plugins from Tempered Works for AI coding tools. Five plugins are for Claude Code. One plugin is for Codex.

A Claude Code "mod" is a plugin of function hooks. A function hook is code that Claude Code runs when an event occurs, for example when a tool call ends. The five Claude Code plugins here are mods. They run inside Claude Code, in the terminal and in the desktop Code tab.

## What is in this repository

| Folder | Tool | What it does |
|---|---|---|
| `ship-state/` | Claude Code | Shows the git, pull request, CI and deploy state of the current repo in one line above the prompt. Ends the line with a button to commit or push. |
| `timeline/` | Claude Code | Shows a vertical timeline of the work in a side pane: what you asked, what Claude did, and what each subagent is doing. |
| `limit-resume/` | Claude Code | Shows your usage limits and continues a turn after a rate limit resets. |
| `followups/` | Claude Code | Shows 4 options for your next prompt above the prompt box after each answer. You press 1 to 4 to put one in the box. |
| `lessons/` | Claude Code | Finds wins and pitfalls in your prompts. It then asks Claude to run your own `win-logger` and `pitfall-logger` skills. The status line shows how many entries you logged. |
| `multi-harness/` | Codex | Gives Codex 6 skills to plan large work in waves and to track it to completion. |
| `.claude-plugin/marketplace.json` | Claude Code | Lists the 5 Claude Code plugins so that Claude Code can install them from this repository. |

## Why these plugins exist

**ship-state.** During a coding session, you often need to know if your work is pushed, if CI passed, and if production has the change. Without this plugin, you ask Claude, and Claude runs `git` and `gh` commands to find out. Each check costs a model turn. ship-state shows the answer on screen at all times and makes no model calls. When the tree has uncommitted files, the line ends with a button. One key sends the commit prompt. You do not type it.

**timeline.** Long work with many steps and many subagents is hard to follow. Without a record, you ask "what is left?" and "what is the current goal?" many times. You also cannot see which model each subagent uses. timeline keeps one record per repo across sessions and shows it as a timeline.

**limit-resume.** When a session hits a usage limit, the work stops until you type "try again". If you are away, the session stays idle after the limit resets. limit-resume continues the work at the reset time. It also shows your usage before you reach the limit.

**followups.** Claude Code shows one grey suggestion for your next prompt. That suggestion is often the wrong one. followups shows 4 options in 4 directions: continue the plan, verify the work, take the alternative path, and wrap up. These options cover the usual next moves. You choose one and edit it. followups sends nothing until you press Enter.

**lessons.** The same mistakes happen again, and good patterns get lost. A skill that logs them is useful, but it often does not run at the right moment. lessons makes the skill run. It reads your prompts for praise, frustration, and repeated requests. When it finds one, it tells Claude to run the matching skill after Claude finishes your request. The skill always asks "Log it? y/n" before it writes. You stay in control.

**multi-harness.** Large product work needs a plan, branch and pull request gates, tracker updates, QA evidence, and a safe closeout. multi-harness gives Codex a repeatable method for these steps. The method is the same for every product.

## Requirements

- Claude Code with support for function-hook plugins. We tested the plugins on Claude Code 2.1.288 on macOS. All Claude Code plugins pass `claude plugin validate`.
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
/plugin install followups@tempered-plugins
/plugin install lessons@tempered-plugins
```

Install only the plugins that you want.

**Method 2: load the folders directly.** Clone this repository. Then add the plugin folders to the `env` block of `~/.claude/settings.json`. Separate the folders with `:`.

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/tempered_plugins/ship-state:/path/to/tempered_plugins/timeline:/path/to/tempered_plugins/followups:/path/to/tempered_plugins/lessons" } }
```

New sessions load the plugins. Sessions that are already open do not.

## How to use ship-state

ship-state needs no action. It starts with each session.

1. Look at the band above the prompt. It shows the current repo and branch.
2. Read the state from left to right:

```
app ⎇ feat/waitlist  ·  3 dirty  ·  ↑2 ↓0  ·  PR #312  ·  CI ⏳ 4/5  ·  prod = HEAD ✓ 2h ago  ·  0: commit 3 files
```

| Part | Meaning |
|---|---|
| `3 dirty` | 3 files have changes that are not committed. |
| `↑2 ↓0` | 2 commits are not pushed. 0 commits are not pulled. |
| `PR #312` | The branch has open pull request 312. |
| `CI ⏳ 4/5` | 4 of 5 CI checks are complete. |
| `prod = HEAD ✓` | Production runs the current commit. |
| `0: commit 3 files` | A button. Press `0` in an empty prompt box, or click it. ship-state sends "Commit the working tree changes with a sensible message." to Claude. After 5 minutes, the button also shows how long the files have waited, for example `· 24m ago`. The key `0` works only when the prompt box is empty. If you type `0` as the first character of a message, it presses the button and sends the commit prompt or the push prompt. Type a space first to start a message with `0`. |

3. After a push or a merge, wait for the toast. ship-state shows "CI ✓", "CI ✗" with the failed check names, or "Live on prod".
4. When the tree is clean and commits are not pushed, the button reads `0: push ↑2`. It sends "Push the branch." to Claude. The button does not show while Claude works. After you press it, the button stays hidden until Claude's turn ends, or for 60 seconds at most.

ship-state follows Claude when Claude changes to another repo or worktree. It reads local git data every 20 seconds. It reads GitHub data every 5 minutes. After a push or merge, it reads GitHub data every 20 seconds for 10 minutes.

The band of ship-state stacks with the bands of other plugins, such as followups.
followups uses the keys 1 to 4. ship-state uses the key 0.

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

## How to use followups

followups needs no action. It starts with each session.

1. Wait for Claude to finish an answer. A few seconds later, 4 options appear in the band above the prompt box. Each option has its own row: `1: …` to `4: …`.
2. Read the options. Each option goes in a different direction:
   - Continue the plan.
   - Verify or test the work.
   - Take the alternative path, or ask an open question.
   - Wrap up or commit.
3. Press `1` to `4` when the prompt box is empty. You can also click an option. The text of the option goes into the prompt box.
4. Edit the text, or press Enter to send it. followups never sends anything by itself.
5. To ignore the options, type your own message.
6. To turn the plugin off or on, type `/followups off` or `/followups on`. Type `/followups status` to see the current setting and the last error, for example a refused model call.

When the band shows, a digit that you type in an empty prompt box picks an option. To start a message with a digit, type a space first.

The band hides while the prompt box has text, while a turn runs, and while a survey uses the band. It comes back when the prompt box is empty.

followups hides the built-in grey suggestion of Claude Code, but only after its own band has drawn once. In a surface without the band, the built-in suggestion stays.

followups makes no options for subagent turns, interrupted turns, errors, and empty answers. If you send a prompt before Haiku answers, followups drops the old reply. After `/clear` or a resume, followups removes the old options.

Usage cost: followups makes one Haiku call for each answered turn. A call costs approximately 2,000 input tokens and 150 output tokens. followups adds nothing to the context of the main model.

Privacy: the first 1,500 characters of your last prompt and the last 4,000 characters of the answer go to Haiku. The call uses the API client of Claude Code.

## How to use lessons

lessons needs 2 skills of your own. Name them `win-logger` and `pitfall-logger`. This repository does not include them. The skills decide where an entry goes, for example a Notion database. Each skill always asks "Log it? y/n" before it writes.

1. Add the 2 skills to Claude Code. Any skills with these names work.
2. Work as usual. lessons watches only the prompts that you send yourself: in the terminal, in Remote Control, in your own Slack ping, and in the Claude desktop app. It ignores prompts from plugins, notifications, other sessions, and subagents.
3. Send a prompt that shows a win or a pitfall. The table below lists the signals.
4. Claude finishes your request first. Then Claude runs the matching skill. lessons adds a short note to your prompt to cause this. You do not see the note.
5. Read the draft that the skill shows. Answer `y` to log it. Answer `n` to skip it.
6. Look at the status line. `🌱 2 · ⚠ 1` means 2 wins and 1 pitfall are logged in this session. lessons counts a row when you answer `y` to a draft. The count resets after `/clear` or a resume.
7. To turn the plugin off or on, type `/lessons off` or `/lessons on`. Type `/lessons status` to see the setting, the counts, and where each skill was found.

| Kind | Signals |
|---|---|
| Win | Praise, for example "perfect", "nailed it", "love this", "this is great", "exactly what I wanted". Or an ask: "log this win", "log this as a win", "add this to learnings", "remember this worked". |
| Pitfall | Frustration, for example "I already told you", "no, I said", "still wrong", "still failing", "this is the third time", "why did you change…", "not what I asked". Or shouting: several words in all capitals. Or the same request sent again: it has high word overlap with one of your last 10 prompts. Or an ask: "log this", "add this to pitfalls", "remember this lesson". |

lessons avoids common false signals. These prompts do not trigger it: "exactly 3 retries", "pixel perfect", "log this error to sentry", "why did you choose zod?", "the second time I click it throws". File names such as README or CHANGELOG do not trigger it. HTTP method names do not trigger it.

lessons adds at most 1 note of each kind for each 5 prompts.

lessons looks for the skills in 2 places:

- The skills loaded in the session. The name can also be `anthropic-skills:<name>`.
- On macOS, the synced-skills folder of the Claude desktop app.

If a skill is missing, lessons shows a toast at most once a day. `/lessons status` shows "missing" for that skill.

Usage cost: lessons makes no model calls. A note costs approximately 40 tokens. lessons adds a note only to a prompt that matches.

Privacy: your last 10 prompts stay in memory only, for the repeat check. lessons does not write them to disk.

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

multi-harness is a Codex plugin. Its manifest is `multi-harness/.codex-plugin/plugin.json`, and its plugin name is `platform-orchestrator`. It is not in the Claude Code marketplace file.

1. Install the `multi-harness` folder with the Codex plugin installer.
2. Ask Codex to use Platform Orchestrator on a backlog. For example: "Use Platform Orchestrator to turn this backlog into shippable waves, branch and PR gates, tracker updates, and verification evidence."
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
node followups/checks/ask.check.ts
node lessons/checks/detect.check.ts
bash timeline/checks/run.sh
```

To run the behavior test of ship-state, run `claude plugin test ship-state`. It runs 16 cases on the terminal and desktop surfaces.

To run the behavior test of followups, run `claude plugin test followups`. It runs 8 cases on the terminal and desktop surfaces.

To run the behavior test of lessons, run `claude plugin test lessons`. It runs 9 cases.

To type-check timeline, do these 2 steps:

1. In a Claude Code session in this repository, run `/plugin-types .claude/types`. This command writes the Claude Code type declarations.
2. Run `tsc -p timeline/tsconfig.check.json`.

## License

MIT. See [LICENSE](LICENSE). Copyright 2026 Tempered Works LLC.
