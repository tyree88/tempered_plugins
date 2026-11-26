---
name: Interpolate gradients in OKLCH
category: visual
applies_to: any, button, image
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

A gradient runs between two distant hues, such as blue to orange. The default sRGB interpolation passes through a muddy grey in the middle. Interpolating in OKLCH keeps the midpoint saturated.

## Values

- Before: `linear-gradient(90deg, #2563eb, #f59e0b)`, midpoint about `#8d807b` (grey).
- After: `linear-gradient(90deg in oklch, #2563eb, #f59e0b)`, midpoint about `#df57a9` (pink).
- Only the interpolation space changes; the end colours stay the same.

## Reference

```css
.banner {
  background: linear-gradient(90deg, #2563eb, #f59e0b); /* fallback */
  background: linear-gradient(90deg in oklch, #2563eb, #f59e0b);
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  background: linear-gradient(90deg, #2563eb, #f59e0b);
  background: linear-gradient(90deg in oklch, #2563eb, #f59e0b);
}
```
