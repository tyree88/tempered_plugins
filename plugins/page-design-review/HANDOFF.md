# Page Design Review handoff

Version 0.1.0 is ready for source handoff. The local Codex installation and a fresh Desktop chat exercised review, preview, and selected application on Fieldnote on November 17, 2026.

## Files and responsibilities

| File | Purpose |
| --- | --- |
| `skills/page-design-review/SKILL.md` | Intake, evidence collection, review rubric, finding IDs, preview, selected edits, and verification |
| `server.py` | Dependency-free Python stdio MCP server for document overflow and text contrast calculations |
| `plugin.json` and `mcp.json` | Portable plugin metadata and MCP configuration |
| `.codex-plugin/plugin.json` and `.mcp.json` | Codex compatibility metadata and relative server launch path |
| `.agents/plugins/marketplace.json` | Local marketplace used by the installation commands in the README |
| `examples/onboarding.html` | Original synthetic Fieldnote page with two intentional review findings |
| `checks/check_server.py` | Runnable smoke check for startup, discovery, measurements, invalid input, and protocol recovery |
| `assets/icon.png` | Plugin picker icon |

Codex supplies the browser, visual reasoning, file access, and source editing. The MCP server calculates from measurements supplied by the host. It accepts no file paths, URLs, shell commands, or edit requests.

## Measurement contract

`review_measurements` accepts `viewports`, `text`, or both. Each supplied array contains 1–30 samples.

- A viewport sample has `label`, `clientWidth`, and `scrollWidth`. Widths are positive integers in CSS pixels. The result adds `overflowPx` and a `clear` or `inspect` status.
- A text sample has `label`, `foreground`, `background`, `fontSize`, and `bold`. Colors are opaque six-digit sRGB hex values. The result adds `ratio`, `minimum`, and a `pass` or `fail` status.
- Tool results return JSON in the first text content block, including calculation limits. Invalid arguments return `isError: true`. Malformed protocol messages return JSON-RPC errors.

The skill directs the host to inspect reported overflow and verify color provenance. A pass applies to the supplied samples.

## Verified behavior

Codex CLI 0.169.0 installed the local package and discovered its skill and MCP tool. Codex's local plugin catalog reported the plugin installed and enabled. A fresh Desktop chat selected the plugin by its mention and used the tool.

The Fieldnote test ran against a disposable copy in Chromium. Review and preview preserved the copy. Applying only F1 removed the checklist's `min-inline-size: 420px` declaration.

| Check | Before F1 | After F1 |
| --- | --- | --- |
| Document overflow at 375px | 69px | 0px |
| Document overflow at 1280px | 0px | 0px |
| F2 time-estimate contrast, both widths | 2.56:1, fail | 2.56:1, fail |

All three checklist items fit after the edit. Tab reached the main action, Enter moved focus to the checklist, and visible focus remained present. Reduced motion changed the action transition from 150ms to 0ms. The bundled fixture retains both intentional defects for repeatable reviews.

The smoke check passed startup, tool discovery, contrast thresholds, overflow calculations, rejection of invalid values and path arguments, and recovery after malformed JSON.

## Verification limits

- The visual Desktop plugin picker remains unverified because computer-use access to Codex's own window was blocked.
- Portable manifests were inspected as JSON. Runtime verification used Codex's compatibility configuration.
- Live browser checks covered Chromium on macOS. Other browsers, operating systems, screen readers, and complex applications need their own acceptance checks.
- Arbitrary source edits use Codex's workspace tools and permissions. Path rejection was tested at the measurement tool boundary.

## Maintaining the package

Edit the source directory and use Codex's supported reinstall flow to update an installed copy. Keep identity, version, and interface metadata synchronized across the portable and Codex manifests. Keep the server version synchronized when releasing runtime changes.

Run the smoke check from the README after server changes. Repeat the Fieldnote review, preview, and selected apply flow after workflow or packaging changes. Keep source changes scoped to selected findings.

The review rubric is proposed house guidance. Typography, density, color, geometry, and motion choices remain contextual. Fieldnote's styling is a demonstration. Use the reviewed product's existing tokens and components.
