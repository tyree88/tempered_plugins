---
name: Automatic hyphenation for narrow columns
category: type
applies_to: text
source: owner
added: 2026-11-18
---

## When

Justified or narrow text (cards, sidebars, mobile columns) shows large gaps between words or long words that overflow, because the browser only breaks at spaces.

## Values

- `hyphens: auto`, which works only when the element or an ancestor has a correct `lang` attribute.
- `hyphenate-limit-chars: 6 3 2`: words of at least 6 characters, at least 3 before the break and 2 after.
- Do not hyphenate headings, links, code or names: set `hyphens: manual` on them.
- `hyphenate-limit-chars` support is partial (Chromium only; Safari has `-webkit-hyphenate-limit-before`/`-after`); without it, `hyphens: auto` still works with the browser's own limits.

## Reference

```css
.prose {
  hyphens: auto;
  -webkit-hyphens: auto;
  hyphenate-limit-chars: 6 3 2;
}
.prose :is(h1, h2, h3, a, code) {
  hyphens: manual;
}
```

```html
<html lang="en">
```

## Reduced motion

Not affected.

## Patch

```css
& {
  hyphens: auto;
  -webkit-hyphens: auto;
  hyphenate-limit-chars: 6 3 2;
}
```
