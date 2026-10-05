#!/usr/bin/env python3
"""Render a compact platform wave plan from a JSON file.

Input shape:
{
  "title": "Component Platform",
  "source": {"report": "...", "tracker": "...", "issue": "...", "base_branch": "develop"},
  "waves": [
    {
      "wave": 1,
      "branch": "codex/example-foundation",
      "agent": "Foundation",
      "scope": "Contracts",
      "dependencies": "None",
      "trackers": "Roadmap row",
      "verification": "npm run check"
    }
  ]
}
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(text(item) for item in value)
    return str(value)


def render(data: dict[str, Any]) -> str:
    source = data.get("source", {})
    waves = data.get("waves", [])
    lines = [
        f"# {text(data.get('title', 'Platform Wave Plan'))}",
        "",
        "## Source Of Truth",
        f"- Report: {text(source.get('report'))}",
        f"- Tracker: {text(source.get('tracker'))}",
        f"- GitHub issue / epic: {text(source.get('issue'))}",
        f"- Base branch: {text(source.get('base_branch'))}",
        "",
        "## Wave Table",
        "| Wave | Branch | Agent Lane | Scope | Dependencies | Tracker Rows | Verification |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]

    for wave in waves:
        lines.append(
            "| {wave} | {branch} | {agent} | {scope} | {dependencies} | {trackers} | {verification} |".format(
                wave=text(wave.get("wave")),
                branch=text(wave.get("branch")),
                agent=text(wave.get("agent")),
                scope=text(wave.get("scope")),
                dependencies=text(wave.get("dependencies")),
                trackers=text(wave.get("trackers")),
                verification=text(wave.get("verification")),
            )
        )

    deferred = data.get("deferred", [])
    if deferred:
        lines.extend(["", "## Deferred Work"])
        lines.extend(f"- {text(item)}" for item in deferred)

    next_entry = data.get("next_entry", {})
    if next_entry:
        lines.extend(
            [
                "",
                "## Next Entry Point",
                f"- First branch: {text(next_entry.get('branch'))}",
                f"- First command: {text(next_entry.get('command'))}",
                f"- First verification gate: {text(next_entry.get('verification'))}",
            ]
        )

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a platform wave plan from JSON.")
    parser.add_argument("input", type=Path, help="Path to wave-plan JSON.")
    parser.add_argument("--output", type=Path, help="Optional Markdown output path.")
    args = parser.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    markdown = render(data)
    if args.output:
        args.output.write_text(markdown, encoding="utf-8")
    else:
        print(markdown, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

