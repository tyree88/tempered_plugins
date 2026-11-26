---
name: Ease-in-out for moves
category: motion
applies_to: any
source: owner
added: 2026-11-18
---

## When

Something already on screen moves from A to B: a reordered row, a tab indicator, a panel that slides aside. It starts at rest and stops at rest, so it must speed up and slow down.

## Values

- Curve: `cubic-bezier(0.77, 0, 0.175, 1)`. Use this one ease-in-out curve for every move.
- Duration: 200 ms for a move under 100 px; 300 ms for 100 px or more.
- Entrances and exits use the ease-out curve instead; see "Ease-out for entrances".

## Reference

```css
.indicator {
  transition: translate 300ms cubic-bezier(0.77, 0, 0.175, 1);
}

.indicator[data-tab="2"] {
  translate: 160px 0;
}
```

## Reduced motion

Move without animation: set `transition: none`, so the element is at B on the next frame.
