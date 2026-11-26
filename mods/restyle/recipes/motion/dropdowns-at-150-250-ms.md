---
name: Dropdowns at 150–250 ms
category: motion
applies_to: menu, popover
source: owner
added: 2026-11-18
---

## When

A dropdown, select list or context menu opens and closes many times a day. Keep it inside 150–250 ms: shorter reads as a flash, longer makes the user wait.

## Values

- Open: 200 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, opacity 0 → 1, scale 0.97 → 1.
- Close: 160 ms (20% shorter), same curve, back to opacity 0 and scale 0.97.
- `transform-origin` at the trigger.

## Reference

```css
.menu {
  transform-origin: top left;
  transition:
    opacity 200ms cubic-bezier(0.32, 0.72, 0, 1),
    scale 200ms cubic-bezier(0.32, 0.72, 0, 1),
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;
}

.menu:not(:popover-open) {
  opacity: 0;
  scale: 0.97;
  transition-duration: 160ms;
}

@starting-style {
  .menu:popover-open {
    opacity: 0;
    scale: 0.97;
  }
}
```

## Reduced motion

Keep the opacity fade (200 ms open, 160 ms close). Remove the scale: set `scale: 1` in both states.

## Patch

```css
& {
  transform-origin: top left;
  animation: restyle-dropdown-open 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes restyle-dropdown-open {
  from {
    opacity: 0;
    scale: 0.97;
  }
}

@keyframes restyle-dropdown-fade {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  & {
    animation-name: restyle-dropdown-fade;
  }
}
```
