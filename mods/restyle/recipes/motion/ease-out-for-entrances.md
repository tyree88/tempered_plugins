---
name: Ease-out for entrances
category: motion
applies_to: popover, menu, tooltip, modal
source: owner
added: 2026-11-18
---

## When

An element appears on screen: a menu, popover, tooltip, toast or dialog. It must start fast, so the interface feels like it answered at once, and then slow into place.

## Values

- Curve: `cubic-bezier(0.32, 0.72, 0, 1)`. It has no y value outside 0–1, so it never overshoots. Use this one ease-out curve for every entrance and exit.
- Entrance durations: tooltip 150 ms; menu, popover, icon swap 200 ms; dialog, panel, page view 250 ms.
- Never use `ease-in` for an entrance: it starts slow and feels late.

## Reference

```css
:root {
  --ease-out: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}

.popover {
  transition: opacity 200ms var(--ease-out), scale 200ms var(--ease-out);
}
```

## Reduced motion

Keep the opacity fade at the same duration. Remove the scale and any translate, so nothing moves.

## Patch

```css
& {
  animation: restyle-ease-out-enter 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes restyle-ease-out-enter {
  from {
    opacity: 0;
    scale: 0.97;
  }
}

@keyframes restyle-ease-out-fade {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  & {
    animation-name: restyle-ease-out-fade;
  }
}
```
