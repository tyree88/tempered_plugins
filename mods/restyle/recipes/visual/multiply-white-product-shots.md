---
name: Multiply blend for white-background product shots
category: visual
applies_to: image
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

Product photos shot on white sit on a tinted card or page. Each image shows as a white box. Multiply blending drops the white and keeps the product, so it sits directly on the surface.

## Values

- Before: `img { mix-blend-mode: normal }`, white boxes visible.
- After: `img { mix-blend-mode: multiply }`.
- Works when the image background is pure white and the surface is lighter than the product. On dark surfaces it darkens the product too.

## Reference

```css
.product-card {
  background: #eadfcd;
}

.product-card img {
  mix-blend-mode: multiply;
}
```

## Reduced motion

Not affected.
