---
name: No bounce on everyday UI
category: motion
applies_to: any
source: owner
added: 2026-11-18
---

## When

Menus, dialogs, toasts, toggles and tabs that people use many times a day. Overshoot and bounce feel playful once and tiring the hundredth time. Keep bounce for rare, celebratory moments.

## Values

- CSS: the ease-out `cubic-bezier(0.32, 0.72, 0, 1)` or the ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)`. Neither has a y value outside 0–1, so neither overshoots.
- Never use a curve with a y value above 1, for example `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- Springs: duration 0.5 s, bounce 0. Bounce 0 settles with no overshoot.

## Reference

```css
.toast {
  transition: translate 250ms cubic-bezier(0.32, 0.72, 0, 1);
}

.toast[data-state="closed"] {
  translate: 0 100%;
  transition-duration: 200ms;
}
```

## Reduced motion

No change to this rule. Apply the reduced-motion behaviour of the recipe that animates the element.
