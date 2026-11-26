---
name: Lighter surfaces for depth in dark mode
category: visual
applies_to: menu, popover, modal, list
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

In dark mode, a menu or popover over a card over the page all share one near-black. Shadows barely show on dark backgrounds, so the layers merge. Make each raised layer a little lighter than the one under it.

## Values

- Before: menu, card and page all `#141417` (OKLCH lightness 19%).
- After: page L 15%, card L 22%, menu L 30%. The menu is `#2d2d33`.
- The video gives the card and page as lightness only; the hex values for those two are not shown.
- Rule: the higher the layer, the lighter its surface.

## Reference

```css
:root {
  --surface-page: oklch(15% 0.005 285);
  --surface-card: oklch(22% 0.005 285);
  --surface-menu: #2d2d33; /* L 30% */
}

body  { background: var(--surface-page); }
.card { background: var(--surface-card); }
.menu { background: var(--surface-menu); }
```

## Reduced motion

Not affected.
