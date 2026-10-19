#!/usr/bin/env python3
"""Lightweight structure check for the Platform Orchestrator plugin."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED_SKILLS = {
    "platform-wave-orchestrator",
    "platform-tracker-sync",
    "platform-pr-closeout",
    "platform-qa-evidence",
    "platform-safety-review",
    "platform-agent-patterns",
}


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    manifest = root / ".codex-plugin" / "plugin.json"
    if not manifest.exists():
        print(f"missing manifest: {manifest}", file=sys.stderr)
        return 1

    data = json.loads(manifest.read_text(encoding="utf-8"))
    if data.get("name") != "platform-orchestrator":
        print("manifest name must be platform-orchestrator", file=sys.stderr)
        return 1

    claude_manifest = root / ".claude-plugin" / "plugin.json"
    if not claude_manifest.exists():
        print(f"missing manifest: {claude_manifest}", file=sys.stderr)
        return 1
    if json.loads(claude_manifest.read_text(encoding="utf-8")).get("name") != "multi-harness":
        print("Claude Code manifest name must be multi-harness", file=sys.stderr)
        return 1

    missing = sorted(
        skill for skill in REQUIRED_SKILLS if not (root / "skills" / skill / "SKILL.md").exists()
    )
    if missing:
        print(f"missing skills: {', '.join(missing)}", file=sys.stderr)
        return 1

    for template in ("wave-plan.md", "tracker-sync.md", "pr-closeout.md", "qa-evidence.md"):
        path = root / "assets" / "templates" / template
        if not path.exists():
            print(f"missing template: {template}", file=sys.stderr)
            return 1

    print(f"platform-orchestrator structure ok: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
