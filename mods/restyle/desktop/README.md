# restyle desktop

A desktop window for restyle. It audits a web app that runs now, shows each finding with a live copy of the element, lets you try recipes on the copy, and gives a fix prompt for each finding you accept.

This is a scaffold: it runs from source and it is wired end to end. It is not packaged or signed.

## Requirements

- Node 22.18 or later, and npm.
- Chrome or Chromium on this machine. The audit driver starts it without a window. Set `CHROME_PATH` if it is in an unusual place.

## Run it

Run these commands in this folder.

```bash
npm install
```

```bash
npm start
```

1. Type the address of your running app in **Site**, for example `http://localhost:3000`.
2. Press **Run audit**. The audit reads up to **Pages** pages at 1440 and 390 px. It does not sign in, click or submit.
3. Select a finding. Press recipes on the shelf: each one changes the variant of the live copy.
4. Press **Accept**, or **Dismiss** with a reason. The next audit of the same app leaves a dismissed finding out.
5. Open **Queue**. Copy a prompt into your coding agent, read it, then send it.

Keys on the board: `J` and `K` move, `1` to `9` pick a recipe, `A` accepts, `D` dismisses.

## How it is built

| File | What it does |
|---|---|
| `main.mjs` | The Electron main process. Serves the window from `app://restyle`, answers its calls, owns the files and the clipboard. |
| `core.mjs` | What the app does, with no Electron in it: the catalog, the audit, the verdicts, the prompt. |
| `preload.cjs` | The six calls the window can make: `state`, `run`, `verdict`, `prompt`, `copy`, `onProgress`. |
| `renderer/` | The window: one page, one stylesheet, one script. |

`core.mjs` uses the mod's own code and adds no second copy of it: `bridge/audit-url.mjs` audits, `hooks/recipes.ts` reads the catalog, `hooks/compose.ts` writes the prompt. Electron 45 ships Node 24, which imports the `.ts` files as they are.

The app keeps two files in its user-data folder: `board.json` (the last audit, with verdicts) and `dismissed.json` (the dismissed findings of each app). Set `RESTYLE_DATA_DIR` to use another folder.

## Safety

The window shows data from pages that the app does not control.

- The window is sandboxed and has no Node. It reaches the main process only through `preload.cjs`.
- The main process answers only the app's own page, in the window's main frame.
- A content security policy lets the window run its one script and load its one stylesheet. Inline script does not run.
- The live copy of an element is in a frame with no script permission. The copy has no script, form, image or address of any host (`bridge/capsule.mjs`).
- The window cannot go to another page or open another window.
- A verdict names a card by id. The card, and the recipes it can take, come from the file on disk.

## Checks

```bash
npm test
```

Runs the tests of `core.mjs` with Node. No Electron, no browser.

```bash
npm run smoke
```

Loads the window without showing it, prints one line of what it finds, and quits. It checks that the page has the calls, has no Node, is styled, and that inline script is refused. A smoke run uses a temporary data folder.

Set `RESTYLE_SMOKE_URL` to an address to also audit it through the window's own form, accept the first finding and open the queue. Set `RESTYLE_SMOKE_SHOT` to a file path to write a PNG of the board.

## Limits

- The audit needs an installed Chrome or Chromium. The next step is to drive a hidden Electron window over `webContents.debugger`, so the app needs no other browser.
- Pages behind a sign-in are out of scope, as in the mod. A visible audit window where you sign in by hand would bring them in.
- The prompt goes to the clipboard. The app does not talk to a coding agent.
- One window, one app at a time. A new audit replaces the board.
- An audit cannot be stopped. If you quit while one runs, the app waits for it to end.
- No packaging, signing or update.
