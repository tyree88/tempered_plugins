# restyle

restyle connects your running web app to Claude Code. You Alt+click an element in the page. The element shows in a side pane with a catalog of motion and typography recipes. You choose a recipe. restyle puts a prompt in the prompt box that applies the recipe to the source of that element. restyle never sends the prompt.

## How to use restyle

1. Type `/restyle`. The side pane opens, and restyle starts a small server on `127.0.0.1` for this session.
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

1. Make a file `recipes/<category>/<slug>.md`. The category is `motion` or `type`. The slug is lower-case letters, digits and hyphens.
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

3. Fill all five keys. `applies_to` is a comma list of these words: `any`, `button`, `link`, `input`, `toggle`, `popover`, `menu`, `tooltip`, `modal`, `list`, `text`, `heading`, `icon`, `image`. `source` is a URL or `owner`. `added` is `YYYY-MM-DD`.
4. Run `node --test checks/recipes.test.ts`. It parses every recipe file.

A file that fails the parser does not show in the pane. The pane footer counts these files.

## How to schedule the scout

The `restyle-scout` skill finds new details once a week and proposes them as recipes in one draft pull request. It keeps at most 5 new recipes. It never merges and never pushes to `main`.

1. Drop screenshots, links and notes in `inbox/` during the week. See `inbox/README.md`.
2. Make a scheduled task in your own Claude Code account that runs once a week in a checkout of this repository. Use the prompt "Run the restyle-scout skill." The schedule stays in your account, not in the repository.
3. Review the draft pull request. Merge the recipes that you want.

The design is in `docs/design.md`.
