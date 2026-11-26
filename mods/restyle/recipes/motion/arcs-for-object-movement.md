---
name: Arcs for object movement
category: motion
applies_to: icon, image
source: owner
added: 2026-11-18
---

## When

An object travels across the screen: an item flies to a cart, a token moves to a slot, a thumbnail goes to a dock. Real objects move on curves; a straight line looks mechanical.

## Values

- Path: a quadratic curve whose control point sits above the midpoint by 30% of the travel distance. For a 240 px move: control point at (120, −72).
- Duration: 300 ms (a move of 100 px or more), `cubic-bezier(0.77, 0, 0.175, 1)`.
- `offset-rotate: 0deg` so the object does not turn with the path.

## Reference

```css
.token {
  offset-path: path("M 0 0 Q 120 -72 240 0");
  offset-rotate: 0deg;
  offset-distance: 0%;
  transition: offset-distance 300ms cubic-bezier(0.77, 0, 0.175, 1);
}

.token.at-end {
  offset-distance: 100%;
}
```

## Reduced motion

Do not move the object along the path. Fade it out at the start (160 ms) and fade it in at the end (200 ms).
