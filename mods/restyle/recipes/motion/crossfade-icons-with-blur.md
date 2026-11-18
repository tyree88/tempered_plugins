---
name: Crossfade icons with blur
category: motion
applies_to: icon, button
source: owner
added: 2026-11-18
---

## When

One icon replaces another in the same place: copy becomes check, play becomes pause, menu becomes close. A small blur and scale on the crossfade hide the moment where both shapes overlap.

## Values

- Hidden state: opacity 0, `filter: blur(4px)`, scale 0.9. Shown state: opacity 1, `blur(0)`, scale 1.
- In 200 ms, out 160 ms, both at once, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Stack both icons in one grid cell.

## Reference

```css
.icon-swap {
  display: grid;
}

.icon-swap > svg {
  grid-area: 1 / 1;
  transition:
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    filter 200ms cubic-bezier(0.23, 1, 0.32, 1),
    scale 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.icon-swap > svg[data-state="off"] {
  opacity: 0;
  filter: blur(4px);
  scale: 0.9;
  transition-duration: 160ms;
}
```

## Reduced motion

Keep the opacity crossfade. Remove the blur and the scale.
