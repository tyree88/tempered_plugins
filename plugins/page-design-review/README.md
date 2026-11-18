# Page Design Review

Review a web page in Codex, pick the fixes worth making, and verify the result in your local project. Use a live page, screenshot, or local route as the starting point.

## Install

You need Codex with local plugin support and Python 3.10 or newer on its `PATH`. From the root of this repository, run:

```sh
codex plugin marketplace add "$PWD/plugins/page-design-review"
codex plugin add page-design-review@tempered-works
```

Start a new Codex chat and select **Page Design Review** from the plugin picker. In the CLI, invoke the `$page-design-review:page-design-review` skill. If an existing Codex session does not list the plugin, restart Codex.

## Review, preview, apply

1. **Review.** Give Codex a URL, select a browser tab, attach a screenshot, or point it at a route in your project. State the main task if it is known. Try “Review this onboarding page for someone setting up their first workspace. Check desktop and mobile, and rank the fixes.”
2. **Preview.** Ask “Preview F1” using an ID from the review. With source access, Codex can show a proposed diff. With a screenshot or hosted URL alone, it can describe the implementation.
3. **Apply.** Open the owning local project in Codex and ask “Apply F1 and verify it on mobile and desktop.” Codex uses its workspace tools to edit the selected fix. It checks the diff and repeats the relevant browser and project checks when available.

Reviews cover typography, layout, interaction, visual design, and motion. The rubric adapts to product tasks, from reading a landing page to supervising an AI workflow. Findings cite the observed location or measurement, the impact, the change, and how to verify it. Live browser access depends on the tools available in your Codex session. A screenshot review covers the visible state.

## Try the example

[Fieldnote onboarding](examples/onboarding.html) is a synthetic page with two intentional defects. To try edits on a disposable copy, run this from the repository root:

```sh
fixture_dir="$(mktemp -d)"
cp plugins/page-design-review/examples/onboarding.html "$fixture_dir/"
printf 'Open this directory as the Codex project: %s\n' "$fixture_dir"
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$fixture_dir"
```

Open the printed directory as the Codex project and ask:

> Use Page Design Review on http://127.0.0.1:8765/onboarding.html. Review the setup task at 375px and 1280px. Measure document overflow and the contrast of the time estimate under the main action. Give me separate IDs for each issue.

The checklist’s fixed minimum width extends past the narrow viewport. The time estimate uses low-contrast text. Ask Codex to preview and then apply only the checklist fix using the ID it assigned. Expect the narrow page to fit and the time-estimate contrast finding to remain open. Check that Tab reaches **Open setup checklist**, Enter moves focus to the checklist, and **What should I bring?** opens with the keyboard.

## What runs locally

The plugin’s Python MCP server offers one read-only tool, `review_measurements`. It calculates document overflow and checks rendered text contrast from measured, opaque sRGB color pairs. It makes no network requests, reads no project files, and stores no data. See the [WCAG 2.2 AA contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Codex handles browsing, visual judgment, and authorized source edits. Project files and page evidence used in the chat follow your Codex settings.

Run the server smoke check from the repository root:

```sh
python3 plugins/page-design-review/checks/check_server.py
```

For the file map, verification results, and current limitations, see the [maintainer handoff](HANDOFF.md).
