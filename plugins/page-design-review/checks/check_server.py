#!/usr/bin/env python3
"""Smoke-test the stdio server without external dependencies."""

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def request(method, params, request_id=None):
    message = {"jsonrpc": "2.0", "method": method, "params": params}
    if request_id is not None:
        message["id"] = request_id
    return json.dumps(message)


def call(arguments, request_id):
    return request("tools/call", {"name": "review_measurements", "arguments": arguments}, request_id)


def main():
    narrow = {"label": "Checklist at 375px", "clientWidth": 375, "scrollWidth": 444}
    text = {"label": "Time estimate", "foreground": "#9b9a95", "background": "#f7f4eb",
            "fontSize": 14, "bold": False}
    messages = [
        request("initialize", {"protocolVersion": "2025-06-18"}, 1),
        request("notifications/initialized", {}),
        request("tools/list", {}, 2),
        call({
            "viewports": [narrow, {**narrow, "scrollWidth": 375}],
            "text": [text, {**text, "foreground": "#526258"},
                     {**text, "foreground": "#858585", "fontSize": 24}],
        }, 3),
        call({"viewports": [{**narrow, "clientWidth": True}]}, 4),
        call({"text": [{**text, "background": "#f7f4eb88"}]}, 5),
        call({"path": "../outside.html"}, 6),
        call({}, 7),
        "{bad JSON",
        request("ping", {}, 8),
    ]
    process = subprocess.run(
        [sys.executable, str(ROOT / "server.py")],
        input="\n".join(messages) + "\n", text=True, capture_output=True,
        check=True, timeout=10,
    )
    assert not process.stderr, process.stderr
    replies = [json.loads(line) for line in process.stdout.splitlines()]
    assert [reply["id"] for reply in replies] == [1, 2, 3, 4, 5, 6, 7, None, 8]
    assert replies[0]["result"]["protocolVersion"] == "2025-06-18"
    tools = replies[1]["result"]["tools"]
    assert len(tools) == 1 and tools[0]["name"] == "review_measurements"
    assert tools[0]["annotations"]["readOnlyHint"]
    result = json.loads(replies[2]["result"]["content"][0]["text"])
    assert [item["overflowPx"] for item in result["viewports"]] == [69, 0]
    assert [item["status"] for item in result["text"]] == ["fail", "pass", "pass"]
    assert [item["minimum"] for item in result["text"]] == [4.5, 4.5, 3]
    assert all(reply["result"]["isError"] for reply in replies[3:7])
    assert replies[7]["error"]["code"] == -32700
    assert replies[8]["result"] == {}
    print("MCP startup, discovery, measurements, input rejection, and recovery passed.")


if __name__ == "__main__":
    main()
