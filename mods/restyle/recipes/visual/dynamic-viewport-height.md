---
name: Use dvh for full-height mobile sections
category: visual
applies_to: any
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

A full-height hero or screen on mobile uses `100vh`. In Safari, `vh` is measured with the browser toolbar hidden, so the bottom of the section, often the main button, sits under the toolbar. `dvh` follows the height the user can actually see.

## Values

- Before: `.hero { height: 100vh }`, call to action hidden under the toolbar.
- After: `.hero { height: 100dvh }`.
- Keep `100vh` as a fallback for browsers without `dvh`.

## Reference

```css
.hero {
  height: 100vh; /* fallback */
  height: 100dvh;
}
```

## Reduced motion

Not affected.
