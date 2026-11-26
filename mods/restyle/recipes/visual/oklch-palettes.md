---
name: Build palettes in OKLCH for even lightness
category: visual
applies_to: any, button, icon
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

A set of hues (tags, categories, chart series, avatars) should look equally bright. HSL keeps the same number but not the same perceived lightness: at 50% yellow and green look light and blue and violet look dark. OKLCH lightness tracks what the eye sees.

## Values

- Before: `background: hsl(var(--h) 90% 50%)` for every hue, which gives uneven lightness.
- After: `background: oklch(76% var(--c) var(--h))`: one lightness (76%) for all hues, chroma and hue per swatch.
- The chroma values per hue are not shown in the video. Keep chroma within the sRGB gamut for each hue, or the browser clips it.

## Reference

```css
.swatch {
  --l: 76%;
  background: oklch(var(--l) var(--c) var(--h));
}

.swatch.red    { --c: 0.14; --h: 25; }
.swatch.yellow { --c: 0.14; --h: 90; }
.swatch.blue   { --c: 0.14; --h: 255; }
```

## Reduced motion

Not affected.

## Patch

```css
& {
  --l: 76%;
  --c: 0.14;
  --h: 25;
  background: oklch(var(--l) var(--c) var(--h));
}
```
