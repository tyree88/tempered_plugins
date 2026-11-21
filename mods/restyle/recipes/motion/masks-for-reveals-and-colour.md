---
name: Masks for reveals and colour
category: motion
applies_to: image, heading, button
source: owner
added: 2026-11-18
---

## When

An image or heading is revealed, or a control changes fill colour. Wipe it in with a clip path instead of a fade or a slide: the content stays still and the edge of the mask does the moving.

## Values

- Reveal: `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, left to right.
- Colour change: a fill layer with `clip-path: circle(0% at 50% 50%)` → `circle(75% at 50% 50%)`. 75% covers the corners of the box.
- In 250 ms, out 200 ms, `cubic-bezier(0.32, 0.72, 0, 1)`.

## Reference

```css
.reveal {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.reveal.is-visible {
  clip-path: inset(0 0 0 0);
  transition-duration: 250ms;
}

.button .fill {
  clip-path: circle(0% at 50% 50%);
  transition: clip-path 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.button[aria-pressed="true"] .fill {
  clip-path: circle(75% at 50% 50%);
  transition-duration: 250ms;
}
```

## Reduced motion

No wipe. Set the clip path to its end value at once and fade the content or fill in over the same duration.
