---
name: Lower and thin the link underline
category: type
applies_to: link, text
source: owner
added: 2026-11-18
---

## When

The default underline sits on the descenders and is too heavy, so links in body text look cramped and hard to read.

## Values

- `text-underline-offset: 0.2em` moves the line clear of the baseline.
- `text-decoration-thickness: 0.06em` (about 1 px at 16 px), and `from-font` where the font defines a good value.
- `text-decoration-skip-ink: auto` lets the line break around descenders.
- On hover, thicken to `0.12em`; keep the offset the same so the line does not jump.
- Underline colour: the text colour at 40% opacity, full on hover.

## Reference

```css
a {
  text-decoration-line: underline;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 0.06em;
  text-decoration-skip-ink: auto;
  text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
}
a:hover {
  text-decoration-thickness: 0.12em;
  text-decoration-color: currentColor;
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  text-decoration-line: underline;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 0.06em;
  text-decoration-skip-ink: auto;
  text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
}

&:hover {
  text-decoration-thickness: 0.12em;
  text-decoration-color: currentColor;
}
```
