---
name: platform-pr-closeout
description: Use when preparing a branch or PR for push, review, merge, or session closeout, especially when tracker updates, CI checks, branch divergence, worktree cleanup, and next-entry-point reporting are required.
---

# Platform PR Closeout

Close the loop on implementation work without losing local changes or overstating status.

## Workflow

1. **Inspect local state**
   - `git status --short --branch`
   - `git branch --show-current`
   - `git worktree list --porcelain`
   - Do not delete, reset, or checkout over user changes.

2. **Inspect remote state**
   - Fetch remotes.
   - Check whether the branch is ahead/behind.
   - Inspect open PRs targeting the integration branch.

3. **Run required gates**
   - Use repo-native checks first.
   - For rendered UI work, include build, preview smoke, accessibility, Lighthouse, or equivalent checks when present.
   - Capture exact command results and known failures.

4. **Push and open/update PR**
   - Push only after staging/committing intentional changes.
   - PR description should include scope, verification, tracker links, deferred work, and risks.

5. **Sync trackers**
   - Update roadmap, design/QA gates, GitHub issues, and report links from verified state.
   - If tracker tools are unavailable, produce a pending-sync block.

6. **Merge only when ready**
   - Confirm checks, review status, branch protection, and mergeability.
   - After merge, clean up worktrees and branches only after verifying no unique work remains.

## Final Report

Keep closeouts short:

- branch / PR / target
- verification run and result
- trackers updated
- blockers or skipped writes
- next entry point

## Safety

- No destructive git commands unless the user explicitly asks.
- Do not invent a push, commit, PR, merge, or tracker update.
- If branch divergence exists, explain whether it is local-only, remote-only, or both before fixing it.

