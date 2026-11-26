# restyle

restyle removes the signs of generic machine-made UI from your web app. It connects the running app to Claude Code, audits the page for those signs, and lists them in a side pane with a fix for each. It can also audit a URL with no change to the app, and show the findings on a board with a before and an after picture for a reviewer. You can also choose an element yourself: you Alt+click an element in the page. The element shows in a side pane with a catalog of motion, type, visual and effect recipes. Motion, type and visual recipes restyle the element alone. An effect adds markup, a wrapper, a layer or an SVG filter. You choose a recipe. restyle puts a prompt in the prompt box that applies the recipe to the source of that element. restyle never sends the prompt.

## How to use restyle

1. Type `/restyle`. The side pane opens, and restyle starts a small server on `127.0.0.1` for this session. The server reuses its saved port and token between sessions, so the script tag in your dev layout keeps working. If the saved port is busy, the server takes a free port and the pane shows the new tag.
2. Add the script tag to your dev app. The pane shows the tag for this session, for example:

   ```html
   <script src="http://127.0.0.1:<port>/picker.js?t=<token>"></script>
   ```

   Press the button under the tag to fill a prompt that asks Claude to add the tag to your dev layout behind a development-only check. The tag must not reach production.
3. Reload the page. The pane shows that the picker is connected. If the app has a content security policy, the browser can refuse the tag: allow `http://127.0.0.1:<port>` in `script-src` and `connect-src`, in development only. Or use `/restyle audit <url>`, which needs no tag (see "How to audit a URL").

Then use the audit, the manual pick, or both.

**The audit.** The picker audits the page when it loads. It looks for signs of generic machine-made UI: gradient text, a purple gradient, glass blur on many surfaces, a pill badge above a headline, bounce easing, the same radius and shadow on every card, buzzword copy, emoji as icons, and everything centred. It also makes craft checks: a button with no press feedback, a hit area under 40 by 40 px, more than two corner radii, more than two transition durations on controls, and a heading that wraps with unbalanced lines. The pane lists what it found, in two groups. Press a finding: restyle makes that element the pick and fills a prompt that fixes the sign, with the recipe when the catalog has one. Press Alt+Shift+A in the page to run the audit again, for example after a fix. The audit reads the page and changes nothing.

**The manual pick.**

4. Hold Alt and move the pointer over the page. The element under the pointer gets an outline.
5. Alt+click the element. The pane shows the element: its tag, selector, text and styles, and in a React dev build its component and `file:line`.
6. Choose a recipe in the list. Recipes that match the element come first. Use the keys to move and select.
7. Read the prompt in the prompt box. Edit it, then press Enter to send it.
8. Type `/restyle off` to close the pane and stop the server. This also stops an audit of a URL.

Without a pick, the recipes show but you cannot choose one. Without a source location, the prompt tells Claude to find the element by its selector and text.

## How to audit a URL

This path needs no script tag and makes no change to the app. Use it for an app whose content security policy refuses the tag, or for a deployed page.

1. Type `/restyle audit <url>`. To set the page limit, add a number: `/restyle audit <url> 3`. The limit is 5 pages when you give no number.
2. restyle starts a headless Chrome on your machine and opens the URL. It audits each page at two widths, 1440 px and 390 px. It follows links to pages of the same origin, up to the page limit. The pane shows the progress.
3. When the audit is complete, the pane shows a link to the board. Open the link in your browser. The link works only on your machine and only while `/restyle` runs.
4. Read the board. Each finding is one card: the name, the page, the widths that show it, a picture of the element before, and the fix. A finding at both widths is one card. For three findings the card also shows a picture after, and the values that changed: a small hit area (each side under 40 px goes to 40 px), more than two corner radii (the box takes the most used radius), and an unbalanced heading (`text-wrap: balance`). The after picture is a preview by a CSS patch in the headless page. It is not the real fix. The patch comes off again before the next card.
5. Try recipes on the element. Under the pictures, the card has a live copy of the element and a variant of it, side by side. The copy is the element's own tags and text with its computed styles. It is in a frame that runs no script. You can hover it and press it. Below is the shelf: the recipes of the catalog that fit this element and have a patch. Press a recipe: its patch goes on the variant at once. Press more: they stack, later ones last. Press a recipe again to take it off. The card also names recipes that fit but have no live preview, because they add markup or need a script.
6. Give a verdict on a card:
   - **Accept.** restyle fills the prompt box in Claude Code with the fix for that finding. It does not send the prompt. The pane lists each accepted card; press one to fill its fix again. If you picked recipes for the variant, the one prompt names the element and holds each picked recipe, in the order you picked them.
   - **Dismiss.** Type a reason first. restyle keeps the dismissal for the origin of the page. A later audit of that origin leaves the finding out. The key is the rule and the selector of the element.
   - **Comment.** Optional. With an accept, the comment goes into the prompt as one line. Read it before you send the prompt.
7. The pane shows how many cards wait, how many are accepted and how many are dismissed.

What the live copy does not show. It is a copy by computed styles, not the page. Each card says what its copy leaves out:

- It uses the fonts of your machine. A web font of the page is not loaded, so text can be wider or narrower and can wrap in another place.
- It has the look of the element at the moment of the audit. Hover, press and focus states that the page gives by its stylesheet or by script are not in it. A recipe from the shelf adds its own states.
- Layers made with `::before` and `::after` are not in it. An image is a grey box. The surface behind it is one flat colour.
- Each part has its size in px from the page. A patch that changes the size of the element does not move the parts inside it as the page would.
- An element with more than 200 parts gets no copy. The card says so and keeps its pictures.

The picture of the real page stays on the card beside the copy. Trust the picture for how the element looks, and the copy for how a recipe feels.

What the audit of a URL needs: Node 22.18 or later, and Chrome or Chromium. Set `CHROME_PATH` if restyle does not find the browser.

What it does not do: it does not sign in, click or submit a form. It reads pages only. Pages behind a sign-in are out of scope for now. It does not follow a link that looks like a sign-out link or a file.

Where the data stays:

- The board's data is one JSON file in your temporary folder, `restyle-<port>/board.json`. It holds pictures of the audited pages. The server gives it only to `127.0.0.1`, behind the session token. A new audit replaces it.
- The decisions (accept and dismiss, with the reason and the comment) stay in the mod's own store on your machine, for each origin.
- restyle sends nothing to another machine. The audited site gets ordinary page requests from the headless Chrome.

Limits: a dismissal is known by the rule and the selector, so it can hide a finding on another element with the same selector on another page of the same origin. The page reports at most two findings for each rule, and a dismissed finding still takes one of the two places. The board takes verdicts in the session that made it.

To run the audit without the pane: `node bridge/audit-url.mjs <url> [more urls] [--pages 5] [--out <file>]`. It prints one JSON line for each step and writes the board's data file. The default file is `restyle-board/board.json` in your temporary folder.

## How to add a recipe

1. Make a file `recipes/<category>/<slug>.md`. The category is `motion`, `type`, `visual` or `effect`. Choose it by this test: the detail restyles one existing element and adds no markup, so it is `motion`, `type` or `visual`; the detail adds markup, a wrapper, a layer or a filter, so it is `effect`. The pane lists effects last, under "Effects (add markup)". The slug is lower-case letters, digits and hyphens.
2. Use this format:

   ```markdown
   ---
   name: Scale to 0.97 on press
   category: motion
   applies_to: button, toggle
   source: owner
   added: 2026-11-18
   ---

   ## When

   One or two sentences: the situation this detail is for.

   ## Values

   The exact numbers: durations in ms, easing, scales, distances.

   ## Reference

   One short snippet, CSS first. Motion (the React library) only where CSS cannot do it.

   ## Reduced motion

   What happens under `prefers-reduced-motion: reduce`. For a type recipe: `Not affected.`
   ```

3. Fill all five keys. `applies_to` is a comma list of these words: `any`, `button`, `link`, `input`, `toggle`, `popover`, `menu`, `tooltip`, `modal`, `list`, `text`, `heading`, `icon`, `image`, `nav`, `slider`, `progress`, `card`, `carousel`, `background`. For an effect, the first bullet under `## Values` says what markup or layer the recipe adds. `source` is a URL or `owner`. `added` is `YYYY-MM-DD`.
4. Optional: add a last section, `## Patch`, with one fenced `css` block. The patch shows the recipe on one existing element. The board puts it on a live copy of a real element (see "How to audit a URL"). `&` stands for the element:

   ````markdown
   ## Patch

   ```css
   & {
     transition: scale 150ms ease-out;
   }

   &:active {
     scale: 0.97;
   }

   @media (prefers-reduced-motion: reduce) {
     & {
       transition: none;
     }
   }
   ```
   ````

   Add a patch only where CSS on that one element, with no added markup and no script, shows what the recipe does. Write flat rules. Each selector starts with `&`, then only pseudo-classes, pseudo-elements or attribute tests on the element (`&:hover`, `&:active`, `&::after`, `&[aria-pressed="true"]`). A selector with a combinator (`& span`, `& + p`) is refused: the patch can style nothing but the element. `@media` around such rules and `@keyframes` are allowed; every other at-rule is refused. `@import`, `url(`, `image-set(`, `<`, a backslash and `//` are refused: the patch can load nothing. A patch with motion has its reduced-motion path. The prompt that restyle fills does not hold the patch: it holds the four sections above it.
5. Run `node --test checks/recipes.check.ts`. It parses every recipe file, and checks each patch.

A file that fails the parser does not show in the pane. The pane footer counts these files.

A new recipe keeps the shared values of the catalog: ease-out `cubic-bezier(0.32, 0.72, 0, 1)`, ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)`, press scale 0.97 for 150 ms both ways, overlays that start at scale 0.97, exits 20% shorter than entrances (press is the exception), springs with `duration: 0.5` and `bounce: 0`, and no bounce on everyday UI.

## Design rules skill

The `restyle-rules` skill holds the design rules that Claude follows on every interface task: six principles, the shared values, rules about people (Fitts, Hick, Miller, Jakob, Postel and Doherty), and the signs of generic machine-made UI to avoid. Claude loads it when a task changes an interface, with or without a pick. You do not call it.

## How to schedule the scout

The `restyle-scout` skill finds new details once a week and proposes them as recipes in one draft pull request. It keeps at most 5 new recipes. It never merges and never pushes to `main`.

1. Drop screenshots, links and notes in `inbox/` during the week. See `inbox/README.md`.
2. Make a scheduled task in your own Claude Code account that runs once a week in a checkout of this repository. Use the prompt "Run the restyle-scout skill." The schedule stays in your account, not in the repository.
3. Review the draft pull request. Merge the recipes that you want.

The design is in `docs/design.md`.
