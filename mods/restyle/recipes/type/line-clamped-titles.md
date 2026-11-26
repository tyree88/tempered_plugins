---
name: Clamp titles to two lines
category: type
applies_to: heading, text, list
source: owner
added: 2026-11-18
---

## When

Card or list titles of different lengths make cards different heights, or a long title pushes the rest of the card out of view.

## Values

- Two lines for card titles, three for descriptions.
- Reserve the height so short titles do not make short cards: `min-height: calc(2 * 1.3em)` with `line-height: 1.3`.
- Put the full title in `title` (or keep it in the link's accessible name) so the cut text is still reachable.
- Unprefixed `line-clamp` support is partial; the `-webkit-line-clamp` form with `display: -webkit-box` works in every current browser, so ship both.

## Reference

```css
.card-title {
  line-height: 1.3;
  min-height: calc(2 * 1.3em);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  line-height: 1.3;
  min-height: calc(2 * 1.3em);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
```
