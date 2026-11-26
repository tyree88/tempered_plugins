---
name: Fade carousel edges with a mask
category: visual
applies_to: list, image
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

A horizontal carousel or scroll row cuts its items off hard at the container edge. A gradient mask fades the first and last part of the row instead, which reads as "more to scroll" and works on any background, because it fades to transparent rather than to a colour.

## Values

- Before: `mask: none`, items sliced at the edges.
- After: `mask: linear-gradient(90deg, #0000, #000 15% 85%, #0000)`.
- Fade over the outer 15% on each side; fully opaque from 15% to 85%.

## Reference

```css
.carousel {
  overflow-x: auto;
  mask: linear-gradient(90deg, #0000, #000 15% 85%, #0000);
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  mask: linear-gradient(90deg, #0000, #000 15% 85%, #0000);
}
```
