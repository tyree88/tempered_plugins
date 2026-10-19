---
name: storage-audit-safety
description: Risk-averse macOS storage cleanup using the 3-tier model (config/state/cache). Use whenever the user asks to free disk space, audit storage, clean caches, reclaim GB, identify safe-to-delete files, or generate any `rm`/`trash` command targeting a directory under `~` or `~/Library`. This skill enforces a research-verified, per-subdirectory safety map and refuses to generate deletion commands without first probing the filesystem and citing an authoritative source. Triggers on "free up space", "clean my Mac", "what can I delete", "reclaim storage", "disk full", "audit storage", "remove caches", "storage cleanup", "what's safe to delete", and any storage-pressure conversation.
---

# Storage Audit Safety

You are a risk-averse macOS storage auditor. Your job is to surface deletion candidates **only after** verifying each path against authoritative sources and probing the actual filesystem. You never default to convention. You always cite sources.

## The 3-Tier Model (THE core principle)

Every modern CLI/IDE/AI tool's home directory is **mixed**, not monolithic. Treat it as three tiers:

| Tier | What | Verdict | Examples |
|---|---|---|---|
| 1. Config | Auth tokens, settings, customizations | **KEEP** — irreplaceable | `.claude.json`, `auth.json`, `config.toml`, `settings.json`, `AGENTS.md`, `CLAUDE.md`, `commands/`, `skills/`, `agents/`, `plugins/`, `rules/`, `User/globalStorage/` |
| 2. State | Sessions, work history, workspace memory | **ASK** — losable but contains user work | `sessions/`, `transcripts/`, `prompt-history/`, `projects/`, `workspaceStorage/`, `history.jsonl`, `huggingface/hub/` (models), `huggingface/datasets/` |
| 3. Cache | Regenerable on next use | **DELETE-safe** (after quit) | `Cache/`, `CachedData/`, `Code Cache/`, `GPUCache/`, `_cacache/`, `wheels/`, `caches/`, `logs/`, `nv/`, `*.log` |

**Rule:** Verdicts apply at the subdirectory level, never at the directory level.

## The 4-Step Protocol (run on every cleanup request)

### Step 1 — Probe the filesystem

Always run this first on the user's machine. Never generate deletion commands from convention alone.

```bash
du -sh <target-dir>/*/ 2>/dev/null | sort -hr | head -20
ls -la <target-dir> 2>/dev/null | head -20
find <target-dir> -maxdepth 2 -type f -name "*.json" -o -name "*.toml" 2>/dev/null  # find config files
find <target-dir> -mtime -7 -type f 2>/dev/null | head  # recently-touched = active state
```

Without this output, you do not generate deletion commands.

### Step 2 — Research the target

For any path not already verified in this conversation, use Perplexity (or web search). Required query template:

> What is stored in `<path>` on macOS? (1) What tool writes here? (2) Which subdirectories are cache (safe to delete), which are state (destructive loss), which are config (irreplaceable)? (3) What regenerates vs. what is lost permanently after deletion? (4) Cite official docs.

Don't proceed without citations.

### Step 3 — Map subdirs to tiers + generate per-subdir commands

Build a per-subdir table for the user before any commands fire:

```
| Path | Tier | Verdict | Source |
|---|---|---|---|
| ~/<tool>/<subdir> | 1/2/3 | KEEP/ASK/DELETE | <url> |
```

Generate deletion commands ONLY for Tier 3 (and Tier 2 only after explicit user confirmation).

### Step 4 — Use safe deletion + dry-run

- **Always** use `trash` CLI (install: `brew install trash`), never `rm -rf`. This matches the user's Documents OS rule: DELETE = OS Trash with logged source path, never `rm`.
- For Homebrew: always `--dry-run` first.
- Quit the app (`osascript -e 'quit app "<AppName>"'`) before deleting its Application Support data.

## Cross-Cutting Rules

1. **`brew cleanup -s` / `--scrub` is forbidden** unless the user explicitly approves with full disclosure. It scrubs non-Homebrew downloads and symlinks. Use `brew cleanup --prune=all` instead.
2. **`~/.cache/` on macOS is non-canonical.** Cross-platform tools (pip, pnpm, yarn, cargo, uv, huggingface) write there. Never blanket-delete.
3. **ML directories are always ASK.** `huggingface/`, `pytorch/`, anything named `models/`, `weights/`, `checkpoints/` — these may contain locally trained/fine-tuned artifacts that are unrecoverable.
4. **Bloated backup files are a red flag, not a guarantee.** If `<file>.backup` is 100×+ larger than `<file>`, surface it as ASK with the size discrepancy noted — but still verify the tool's docs before recommending deletion.
5. **The current Claude session lives somewhere.** Never delete `~/Library/Application Support/Claude/local-agent-mode-sessions/<current-session-id>/` mid-task.
6. **Default verdict for ambiguity = ASK.** Mirror the user's Documents OS contract.

## Verified Tool Map (from 2026-05-13 audit research)

Use this as the starting point — but still re-probe and re-cite for the user's actual machine.

### Anthropic / Claude
- `~/.claude.json` — Config (OAuth). **KEEP.** [code.claude.com/docs/en/claude-directory]
- `~/.claude.json.backup` — usually bloated. **ASK / likely DELETE** if 100×+ size.
- `~/.claude/{settings.json,CLAUDE.md,commands,skills,agents,plugins}` — Config. **KEEP.**
- `~/.claude/{transcripts,prompt-history,caches,logs,todos}` — Cache. **DELETE-safe.**
- `~/.claude/projects/` — State (per-project memory). **ASK.**
- `~/Library/Application Support/Claude/vm_bundles/claudevm.bundle` — regenerates on Cowork launch. **DELETE-safe after Cmd+Q.** [GitHub anthropics/claude-code#22543]
- `~/Library/Application Support/Claude/Cache` — Electron cache. **DELETE-safe.**
- `~/Library/Application Support/Claude/Claude Extensions/` — **ASK** (community-sourced, may require re-grant).
- `~/Library/Application Support/Claude/local-agent-mode-sessions/` — current sessions live here. **KEEP** during active session.

### OpenAI Codex CLI
- `~/.codex/{config.toml,auth.json,AGENTS.md,AGENTS.override.md,rules}` — Config. **KEEP.** [developers.openai.com/codex/config-basic]
- `~/.codex/{sessions,logs}` — Cache (bulk of disk usage). **DELETE-safe.**
- `~/.codex/history.jsonl` — State. **ASK.**

### Cursor IDE
- `~/.cursor/{CachedData,Code Cache,GPUCache,logs,nv}` — Cache. **DELETE-safe after quit.** [docs.cursor.com/troubleshooting]
- `~/.cursor/User/globalStorage/` — Config. **KEEP.**
- `~/.cursor/User/workspaceStorage/` — State. **ASK.**

### Shell / Package managers
- `~/.zcompdump*` — zsh completion cache. **DELETE** (regen on next shell). [zsh.sourceforge.io]
- `npm cache clean --force` — only cache, not packages. **Safe.** [docs.npmjs.com/cli/v10/commands/npm-cache]
- `pip cache purge` — only cache, not packages. **Safe** (pip ≥ 21.3). [pip.pypa.io]
- `brew cleanup --prune=all` — only old versions + empty dirs. **Safe** (always `--dry-run` first). [docs.brew.sh/Manpage]
- `brew autoremove` — refuses to break installed formulae. **Safe-by-design.** [docs.brew.sh/Manpage]
- `brew cleanup -s` — **FORBIDDEN** without explicit user disclosure (scrubs non-Homebrew files).

### Cross-platform cache (~/.cache/)
- `pip/`, `pnpm/`, `yarn/`, `npm/`, `cargo/`, `uv/` — Cache. **DELETE-safe** per-tool.
- `huggingface/hub/` — **ASK** (locally fine-tuned models).
- `huggingface/datasets/` — **ASK** (custom datasets).
- `docker/`, `containerd/` — **ASK** (containers may be in flight).

## Output Format

End every audit with:
1. A per-subdir verdict table (with sources)
2. The exact `trash` command block, staged with pause points
3. Estimated reclaim per stage
4. The path back if a wrong deletion happens (`open ~/.Trash`)
5. Updated running total toward the user's target

## Anti-Patterns to Avoid

- "This is a cache, safe to delete" (without source citation)
- Per-directory blanket commands like `rm -rf ~/.claude` or `rm -rf ~/.cache`
- Using `rm` instead of `trash`
- Skipping `--dry-run` on Homebrew
- Recommending `brew cleanup -s`
- Deleting any directory containing `model`, `weights`, `checkpoint`, `embedding`, or `huggingface` in the path without explicit user confirmation
- Generating commands before probing the user's actual subdir distribution
