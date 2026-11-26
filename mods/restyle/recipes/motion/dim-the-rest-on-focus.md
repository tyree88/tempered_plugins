---
name: Dim the rest on focus
category: motion
applies_to: list
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

The user opens one item of a grid or list: a card grows into a preview, a row expands. If the other items stay at full strength, the eye has no single place to go. Push the siblings back while the chosen item comes forward.

## Values

- Siblings: opacity 1 → 0.4, `filter: blur(2px)`. Pointer events off while dimmed.
- Chosen item: scale 1 → 1.05 and a stronger shadow. If it also moves to a new box, use "Reuse the same layoutId" for the move.
- In 250 ms, out 200 ms (20% shorter), `cubic-bezier(0.32, 0.72, 0, 1)`.
- The video shows the effect but no numbers. Opacity, blur and scale are chosen values; durations and curve are the catalog defaults.

## Reference

```css
.grid > * {
  transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1),
    filter 200ms cubic-bezier(0.32, 0.72, 0, 1),
    scale 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.grid:has(> [aria-expanded="true"]) > * {
  transition-duration: 250ms;
}

.grid:has(> [aria-expanded="true"]) > :not([aria-expanded="true"]) {
  opacity: 0.4;
  filter: blur(2px);
  pointer-events: none;
}

.grid > [aria-expanded="true"] {
  scale: 1.05;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.16);
}
```

## Reduced motion

Keep the dim (opacity 0.4) as a 200 ms crossfade. Remove the blur and the scale.
