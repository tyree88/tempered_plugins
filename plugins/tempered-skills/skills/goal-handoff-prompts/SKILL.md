---
name: goal-handoff-prompts
description: Create paste-ready work handoffs. Every prompt must use Simplified Technical English and contain no more than 4,000 characters.
---

# Goal Handoff Prompts

## Purpose

Create one prompt that lets another agent continue verified work safely. Preserve current facts, evidence, blockers, next actions, and approval limits.

## Required Companion Skill

Load and apply `simplified-technical-english` before drafting the prompt.

Use the registered skill when available. It ships in the same plugin as this skill.

If the skill is unavailable, report the missing dependency. Do not claim that the prompt follows Simplified Technical English.

## Hard Length Limit

The complete paste-ready prompt must contain no more than 4,000 Unicode characters.

Count every character inside the prompt. Include commands, Markdown, spaces, and line breaks. Do not count commentary outside the prompt.

If the prompt exceeds 4,000 characters, remove information in this order:

1. Repeated facts.
2. Background that does not change the next action.
3. Long explanations that an exact path, hash, command, or status can replace.

Keep the goal, workspace, branch, dirty state, verified status, blocker, next steps, safety limits, and completion gates.

Report the final character count outside the prompt.

## When to Use

- Work must continue in another task, agent, chat, or worktree.
- A migration, investigation, test, release, or repair has verified state to preserve.
- The next worker needs exact paths, commits, commands, evidence, or approval limits.

## Required Content

- `Goal`: State one measurable outcome.
- `Workspace`: Give the absolute path, branch, base, dirty state, and branch position. Read the dirty state from `git status --porcelain`. Report tracked modified, untracked, and deleted as three counts. Never report one total.
- `Current truth`: Include only verified facts and results.
- `Blocker`: Give the exact failure, missing input, or earliest incomplete gate.
- `Start here`: List the smallest safe actions in order.
- `Verification`: Give focused commands and expected results.
- `Do not`: State completed work and forbidden or approval-gated actions.
- `Finish when`: State the exact acceptance evidence.

Use exact facts. Mark historical evidence as historical. Never present preparation, plans, or old receipts as current implementation proof.

## Git State Rules

Name the command that produced every state claim. Put the command beside the claim or in `Verification`.

Report branch position from `git rev-list --left-right --count <base>...HEAD`. Give both numbers.

Never read `git diff <base>` as a change set, a deletion set, or a collision set. The two-dot form is symmetric. It does not say which side changed. On a branch that was 1 behind and 7 ahead, it printed 156 changed files and 38 deletions. Nothing was deleted. All 38 paths were the base's later additions.

Compute the real overlap from the merge base:

```bash
MB=$(git merge-base <base> HEAD)
comm -12 <(git diff --name-only "$MB" HEAD | sort) \
         <(git diff --name-only "$MB" <base> | sort)
```

On that same branch the overlap was 0 files, and `git merge-tree --write-tree <base> HEAD` exited 0. Do not write that files collide or conflict unless `git merge-tree` fails.

## Template

````md
/goal goal: [one measurable outcome]

Workspace: `/absolute/path`
Branch: `branch-name`
Base: `commit or branch`
Dirty: `[N] tracked modified, [N] untracked, [N] deleted` (`git status --porcelain`)
Position: `[N] behind, [N] ahead` (`git rev-list --left-right --count [base]...HEAD`)

Current truth:
- [verified fact and evidence]
- [test command and result]
- [known limit]

Blocker:
- [exact failure or earliest incomplete gate]

Start here:
1. [first safe action]
2. [next action]
3. [focused verification]

Verification:
```bash
[focused commands]
```

Do not:
- [forbidden, destructive, live, or completed action]
- [action that requires approval]

Finish when:
- [exact receipt, test, or accepted state]
````

## Final Check

Before delivery:

1. Confirm that `simplified-technical-english` was applied.
2. Confirm that every statement is direct and necessary.
3. Confirm that current and historical evidence are separate.
4. Confirm that every git state claim names the command that produced it.
5. Confirm that no claim about deletions or collisions comes from `git diff <base>`.
6. Count the complete prompt as Unicode characters.
7. Require a count from 1 through 4,000.
8. Report the count outside the prompt.

## Common Errors

- The prompt exceeds 4,000 characters.
- The count excludes Markdown or line breaks.
- The prompt omits the branch or dirty state.
- The prompt says that tests passed without naming commands.
- The prompt gives one uncommitted-file total and hides that most files are untracked.
- The prompt reads `git diff <base>` as a deletion set or a collision set.
- The prompt drops safety limits to reduce length.
- The prompt treats a plan or old result as current proof.
- The prompt does not apply Simplified Technical English.
