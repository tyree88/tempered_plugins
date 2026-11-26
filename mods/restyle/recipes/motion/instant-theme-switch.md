---
name: Instant theme switch
category: motion
applies_to: any
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

The user switches between light and dark theme. Every element with a colour transition starts at once, each at its own duration (a card background at 300 ms, its text at 150 ms), so parts of the page are briefly in the wrong theme and it looks broken. Turn transitions off while the theme changes, so the whole page changes in one step.

## Values

- Theme change duration: 0 ms. Keep the normal colour transitions for hover and other states.
- Put a `theme-switching` class on `<html>` before the theme changes. Remove it after the new styles apply (for example, in the next `requestAnimationFrame`).

## Reference

```css
.theme-switching *,
.theme-switching *::before,
.theme-switching *::after {
  transition: none !important;
}
```

## Reduced motion

The same: the switch is already instant.
