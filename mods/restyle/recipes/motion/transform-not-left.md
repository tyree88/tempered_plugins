---
name: Transform, not left
category: motion
applies_to: any
source: owner
added: 2026-11-18
---

## When

Anything that animates position or size. `left`, `top`, `width`, `height` and `margin` make the browser redo layout on every frame and stutter on slow devices. `transform` (or `translate`, `scale`) and `opacity` run on the compositor.

## Values

- Animate only `transform`, `translate`, `scale`, `rotate`, `opacity`, and where needed `clip-path` and `filter`.
- Duration and curve as the move: 200 ms under 100 px, 300 ms for 100 px or more, `cubic-bezier(0.77, 0, 0.175, 1)`.
- Add `will-change: transform` only during the animation, not permanently.

## Reference

```css
/* Not this: transition: left 300ms; */

.drawer {
  translate: -100% 0;
  transition: translate 300ms cubic-bezier(0.77, 0, 0.175, 1);
}

.drawer.is-open {
  translate: 0 0;
}
```

## Reduced motion

Move without animation: set `transition: none`.
