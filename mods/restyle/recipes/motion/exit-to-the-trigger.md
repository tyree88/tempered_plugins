---
name: Exit to the trigger
category: motion
applies_to: popover, menu, tooltip
source: owner
added: 2026-11-18
---

## When

A popover, menu or tooltip closes. It shrinks back into the trigger it came from, along the same origin it entered on, so the user sees where it went.

## Values

- Keep the entrance `transform-origin` until the exit ends. Do not reset it on close.
- Scale 1 → 0.95, opacity 1 → 0.
- 160 ms (tooltip 120 ms), 20% shorter than the entrance, `cubic-bezier(0.23, 1, 0.32, 1)`.

## Reference

```css
.popover[data-state="closed"] {
  opacity: 0;
  scale: 0.95;
  transition:
    opacity 160ms cubic-bezier(0.23, 1, 0.32, 1),
    scale 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
```

## Reduced motion

Keep the 160 ms opacity fade. No scale.
