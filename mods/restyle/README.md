# restyle

restyle connects your running web app to Claude Code. You Alt+click an element in the page. The element shows in a side pane with a catalog of motion, type, visual and effect recipes. Motion, type and visual recipes restyle the element alone. An effect adds markup, a wrapper, a layer or an SVG filter. You choose a recipe. restyle puts a prompt in the prompt box that applies the recipe to the source of that element. restyle never sends the prompt.

## How to use restyle

1. Type `/restyle`. The side pane opens, and restyle starts a small server on `127.0.0.1` for this session. The server reuses its saved port and token between sessions, so the script tag in your dev layout keeps working. If the saved port is busy, the server takes a free port and the pane shows the new tag.
2. Add the script tag to your dev app. The pane shows the tag for this session, for example:

   ```html
   <script src="http://127.0.0.1:<port>/picker.js?t=<token>"></script>
   ```

   Press the button under the tag to fill a prompt that asks Claude to add the tag to your dev layout behind a development-only check. The tag must not reach production.
3. Reload the page. The pane shows that the picker is connected.
4. Hold Alt and move the pointer over the page. The element under the pointer gets an outline.
5. Alt+click the element. The pane shows the element: its tag, selector, text and styles, and in a React dev build its component and `file:line`.
6. Choose a recipe in the list. Recipes that match the element come first. Use the keys to move and select.
7. Read the prompt in the prompt box. Edit it, then press Enter to send it.
8. Type `/restyle off` to close the pane and stop the server.

Without a pick, the recipes show but you cannot choose one. Without a source location, the prompt tells Claude to find the element by its selector and text.

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
4. Run `node --test checks/recipes.check.ts`. It parses every recipe file.

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
