---
name: Match icon stroke to the text weight
category: visual
applies_to: icon, button, list, menu
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

Line icons sit beside a label, as in a nav list or a button. A thin icon stroke next to bold or medium text looks weak and unfinished. Thicken the icon stroke until its rendered width matches the stem width of the letters.

## Values

- Before: `svg { stroke-width: 1 }`. Magnified, the text stem measures 3.9px and the icon stroke 1.5px.
- After: `svg { stroke-width: 2.6 }`. Both measure 3.9px.
- 2.6 is right for that font, weight and icon size only. Measure the stem of a letter such as `l` and the icon stroke at the rendered size, then adjust.

## Reference

```css
.nav-item svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

## Reduced motion

Not affected.
