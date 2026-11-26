---
name: Inner radius equals outer radius minus padding
category: visual
applies_to: any, image, button
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

A rounded element sits inside another rounded element, such as an image in a card or a button in a toolbar. If both use the same radius, the gap between the two curves is wider at the corner than along the sides, and the corner looks pinched.

## Values

- Inner radius = outer radius − the padding between the two edges.
- Example: outer 48px, padding 18px, inner `calc(48px - 18px)` = 30px.
- With the same 48px on both, the gap at the corner measures 25px against 18px on the straight edge. With 30px inside, the gap is 18px all the way round.
- If the padding is larger than the outer radius, the inner corner goes square (0), not negative.

## Reference

```css
.card {
  --radius: 48px;
  --pad: 18px;
  border-radius: var(--radius);
  padding: var(--pad);
}

.card > .inner {
  border-radius: max(0px, calc(var(--radius) - var(--pad)));
}
```

## Reduced motion

Not affected.
