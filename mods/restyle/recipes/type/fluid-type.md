---
name: Fluid type size with clamp
category: type
applies_to: heading, text
source: owner
added: 2026-11-18
---

## When

A heading is right on desktop but too large on a phone (or the other way round), and breakpoint jumps make the size change in steps.

## Values

- Minimum 32 px at a 360 px viewport, maximum 56 px at a 1280 px viewport.
- Slope: (56 - 32) / (1280 - 360) = 2.6087vw per px of viewport; intercept: 32 - 360 × 0.026087 = 22.61 px.
- Result: `clamp(2rem, 1.413rem + 2.609vw, 3.5rem)`.
- Keep a `rem` term in the middle value so the size still follows the reader's browser zoom.
- Line height drops as size grows: `line-height: 1.1` for headings, 1.5 for body.

## Reference

```css
h1 {
  font-size: clamp(2rem, 1.413rem + 2.609vw, 3.5rem);
  line-height: 1.1;
}
/* Body: 16 px at 360 px, 18 px at 1280 px */
body {
  font-size: clamp(1rem, 0.951rem + 0.217vw, 1.125rem);
  line-height: 1.5;
}
```

## Reduced motion

Not affected.
