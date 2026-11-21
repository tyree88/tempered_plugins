---
name: Exits 20% shorter than entrances
category: motion
applies_to: popover, menu, tooltip, modal
source: owner
added: 2026-11-18
---

## When

Anything that enters and later leaves. The user has already decided to dismiss it, so the exit should get out of the way faster than the entrance came in.

## Values

- Exit duration = entrance duration × 0.8, same ease-out curve `cubic-bezier(0.32, 0.72, 0, 1)`.
- Tooltip 150 → 120 ms. Menu, popover, icon swap 200 → 160 ms. Dialog, panel, page view 250 → 200 ms.
- Put the shorter duration on the closed state: a CSS transition takes its timing from the state it moves to.
- Press feedback is not an exit: it uses the same duration both ways (see "Scale to 0.97 on press").

## Reference

```css
.dialog {
  transition:
    opacity 250ms cubic-bezier(0.32, 0.72, 0, 1),
    scale 250ms cubic-bezier(0.32, 0.72, 0, 1);
}

.dialog[data-state="closed"] {
  opacity: 0;
  scale: 0.97;
  transition-duration: 200ms;
}
```

## Reduced motion

Keep the same entrance and exit durations for the opacity fade. Remove the scale.
