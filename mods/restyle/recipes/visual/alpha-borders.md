---
name: Translucent borders instead of solid grey
category: visual
applies_to: any, button, input, list
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

The same bordered component appears on white, tinted, saturated and gradient surfaces. A solid light-grey border reads as a pale line pasted over colour. A black border at low alpha darkens whatever is under it, so it looks right on every surface.

## Values

- Before: `border-color: #e4e4e7` (solid).
- After: `border-color: rgb(0 0 0 / 0.12)`.
- On dark surfaces, use white at a similar alpha instead (not shown in the video; my default).

## Reference

```css
.card,
.card .button {
  border: 1px solid rgb(0 0 0 / 0.12);
}

@media (prefers-color-scheme: dark) {
  .card,
  .card .button {
    border-color: rgb(255 255 255 / 0.12);
  }
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  border-color: rgb(0 0 0 / 0.12);
}

@media (prefers-color-scheme: dark) {
  & {
    border-color: rgb(255 255 255 / 0.12);
  }
}
```
