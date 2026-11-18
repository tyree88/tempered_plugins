#!/usr/bin/env python3
"""Local MCP calculations for rendered page measurements."""

import json
import re
import sys


LABEL = {"type": "string", "minLength": 1, "maxLength": 160}
WIDTH = {"type": "integer", "minimum": 1, "maximum": 1_000_000}
COLOR = {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}
FONT_SIZE = {"type": "number", "exclusiveMinimum": 0, "maximum": 1000}
BOLD = {"type": "boolean"}
SAMPLES = {
    "viewports": {"label": LABEL, "clientWidth": WIDTH, "scrollWidth": WIDTH},
    "text": {
        "label": LABEL, "foreground": COLOR, "background": COLOR,
        "fontSize": FONT_SIZE, "bold": BOLD,
    },
}
MAX_SAMPLES = 30
TOOL = {
    "name": "review_measurements",
    "title": "Check page measurements",
    "description": (
        "Check document overflow and text contrast from real browser measurements. "
        "Supply one or both arrays. Label each sample with its location and state. "
        "Widths and fontSize are CSS pixels. For text, use flat, opaque sRGB color pairs "
        "and set bold only for a bold face. Omit unverified or exempt pairs."
    ),
    "inputSchema": {
        "type": "object",
        "additionalProperties": False,
        "minProperties": 1,
        "properties": {
            name: {
                "type": "array",
                "minItems": 1,
                "maxItems": MAX_SAMPLES,
                "items": {
                    "type": "object",
                    "properties": fields,
                    "required": list(fields),
                    "additionalProperties": False,
                },
            }
            for name, fields in SAMPLES.items()
        },
    },
    "annotations": {
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
}
PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [
        value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
        for value in channels
    ]
    red, green, blue = linear
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def check_text(sample):
    dark, light = sorted(luminance(sample[key]) for key in ("foreground", "background"))
    ratio = (light + 0.05) / (dark + 0.05)
    large_size = 14 * 96 / 72 if sample["bold"] else 24
    minimum = 3 if sample["fontSize"] >= large_size else 4.5
    return {
        **sample,
        "ratio": ratio,
        "minimum": minimum,
        "status": "pass" if ratio >= minimum else "fail",
    }


def check_viewport(sample):
    overflow = max(0, sample["scrollWidth"] - sample["clientWidth"])
    return {**sample, "overflowPx": overflow, "status": "inspect" if overflow else "clear"}


def validate_value(value, schema):
    kind = schema["type"]
    if kind == "boolean":
        return type(value) is bool
    if kind == "integer":
        return type(value) is int and schema["minimum"] <= value <= schema["maximum"]
    if kind == "number":
        return type(value) in (int, float) and schema["exclusiveMinimum"] < value <= schema["maximum"]
    if not isinstance(value, str):
        return False
    if "pattern" in schema:
        return re.fullmatch(schema["pattern"], value) is not None
    return bool(value.strip()) and len(value) <= schema["maxLength"]


def review_measurements(arguments):
    if not isinstance(arguments, dict) or not arguments or arguments.keys() - SAMPLES.keys():
        raise ValueError("Supply viewports, text, or both as named sample arrays.")
    result = {
        "limits": [
            "Calculations use the supplied measurements. Verify evidence in the browser.",
            "Document overflow needs inspection. A wide data region can be intentional.",
            "Contrast checks cover the supplied opaque sRGB text pairs only.",
        ],
    }
    for name, samples in arguments.items():
        if not isinstance(samples, list) or not 1 <= len(samples) <= MAX_SAMPLES:
            raise ValueError(f"{name} must contain 1–{MAX_SAMPLES} samples.")
        fields = SAMPLES[name]
        for index, sample in enumerate(samples):
            if not isinstance(sample, dict) or sample.keys() != fields.keys():
                raise ValueError(f"{name}[{index}] requires exactly: {', '.join(fields)}.")
            for field, schema in fields.items():
                if not validate_value(sample[field], schema):
                    raise ValueError(f"Invalid {name}[{index}].{field}. See the tool schema.")
        check = check_viewport if name == "viewports" else check_text
        result[name] = [check(sample) for sample in samples]
    return result


def rpc_error(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def handle(request):
    if not isinstance(request, dict):
        return rpc_error(None, -32600, "Invalid request")
    request_id = request.get("id")
    if (
        request.get("jsonrpc") != "2.0"
        or not isinstance(request.get("method"), str)
        or type(request_id) not in (str, int, type(None))
    ):
        return rpc_error(None, -32600, "Invalid request")
    if "id" not in request:
        return None
    params = request.get("params", {})
    if not isinstance(params, dict):
        return rpc_error(request_id, -32602, "Expected object parameters")

    match request["method"]:
        case "initialize":
            version = params.get("protocolVersion")
            result = {
                "protocolVersion": version if version in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0],
                "serverInfo": {"name": "page-design-evidence", "version": "0.1.0"},
                "capabilities": {"tools": {}},
            }
        case "ping":
            result = {}
        case "tools/list":
            result = {"tools": [TOOL]}
        case "tools/call":
            if params.get("name") != TOOL["name"]:
                return rpc_error(request_id, -32602, "Unknown tool")
            try:
                content = json.dumps(review_measurements(params.get("arguments")), ensure_ascii=True)
                result = {"content": [{"type": "text", "text": content}]}
            except ValueError as error:
                result = {"isError": True, "content": [{"type": "text", "text": str(error)}]}
        case _:
            return rpc_error(request_id, -32601, "Unknown method")
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def main():
    for line in sys.stdin.buffer:
        try:
            request = json.loads(line)
        except (ValueError, RecursionError):
            response = rpc_error(None, -32700, "Invalid JSON")
        else:
            response = handle(request)
        if response is not None:
            print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
