---
name: Transform, not left
category: motion
applies_to: any
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

Anything that moves, such as a toast that slides off screen. Animating `left` or `top` makes the browser redo layout and paint on every frame, and the motion stutters. A transform moves the element without that work, so it stays smooth.

## Values

- Animate `transform` (or `translate`, `scale`, `rotate`) and `opacity`. Do not animate `left`, `top`, `width`, `height` or `margin`.
- Example: a toast leaves with `translateX(100vw)` instead of `left: 100vw`.
- Duration and curve stay the same when you switch: 300 ms, `cubic-bezier(0.32, 0.72, 0, 1)`.

## Reference

```css
/* Not this: transition: left 300ms; .toast.hidden { left: 100vw; } */

.toast {
  transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
}

.toast.hidden {
  transform: translateX(100vw);
}
```

## Reduced motion

Move without animation: set `transition: none`, or fade the toast out with opacity instead.
