---
name: Start popovers at 0.95
category: motion
applies_to: popover, menu
source: owner
added: 2026-11-18
---

## When

A popover, menu or dropdown opens. Growing from 0 looks like it comes from nowhere; a small grow from 0.95 with a fade looks like it was always there and just came into focus.

## Values

- Start: scale 0.95, opacity 0. End: scale 1, opacity 1.
- Never start from scale 0.
- Open 200 ms, close 160 ms, `cubic-bezier(0.23, 1, 0.32, 1)`.

## Reference

```css
.popover {
  transition:
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    scale 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.popover[data-state="closed"] {
  opacity: 0;
  scale: 0.95;
  transition-duration: 160ms;
}
```

## Reduced motion

Keep the opacity fade. Keep scale at 1 in both states.
