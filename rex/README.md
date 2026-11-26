# Rex command center

`cc.lua` adds two commands to the [Rex](https://www.superlogical.com/rex/docs) command palette. Each command opens one pick-list. The module stores nothing, and it never merges, approves or deletes.

| Command | Action name | What the list shows |
|---|---|---|
| Needs Me | `needs_me` | Panes whose program is blocked, failed or finished. Then tasks whose newest timeline entry is blocked or gives you the next step (last 7 days). Then your open pull requests. |
| Threads | `threads` | Tasks that are still active in the timeline logs (last 30 days). Tasks that are almost done come first. |

When you pick a row:

- A pane row moves focus to that pane.
- A task row opens a Rex window in the task's worktree and types `claude --resume <session>`. It does not press Return.
- A pull request row opens the pull request in your browser.

## Where the rows come from

The lists are built each time you open them. They read 3 sources:

- Rex program status. Agents that support the Program Status Protocol (OSC 7501) report it to Rex.
- The logs of the `timeline` mod in `~/.claude/timelines/`.
- `gh search prs --author=@me --state=open`.

A task row goes away when its next step names a pull request (`#12` or `PR 12`) that is closed. If a source cannot be read, the list shows one `error` row for that source.

Your first name comes from `git config --global user.name`. A task's next step is yours when it starts with that name, with `Owner` or with `User`.

## Requirements

- Rex with `rex.ui.pick`. The Rex app and the Rex server must be versions that can show prompts to each other.
- `git`, `gh` (signed in) and `jq` on the Rex server's `PATH`.
- The `timeline` mod, for task rows.

## Install

Add these lines to `~/.config/rex/init.lua`. Use the path of your clone.

```lua
package.path = os.getenv("HOME") .. "/src/tempered_plugins/rex/?.lua;" .. package.path
require("cc")
rex.bind("cmd+shift+m", "needs_me")
rex.bind("cmd+shift+y", "threads")
```

Then run `rex config reload`. Run `rex keymap` to make sure that the two keys are free.

## Without a picker

If no Rex app can show the list, the action returns the rows. `rex do needs_me` and `rex do threads` then print them as JSON in the terminal.

## Check

```sh
cd rex && rex do cc_check.lua      # prints "cc_check: ok"
rex config check ~/.config/rex/init.lua   # reports 2 actions
```

## Limits

- A list is a snapshot. Open it again to update it.
- Task rows are written by agents and can be out of date.
- Pull request numbers are compared across all repos, so a closed pull request can keep a row if another repo has an open pull request with the same number.
- Codex and Gemini sessions show only as pull requests, because they do not write timeline logs.
- The jump to a pane in a different session uses a client action. It can need the Remote Control setting in the Rex app.
