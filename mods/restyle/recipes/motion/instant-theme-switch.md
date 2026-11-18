---
name: Instant theme switch
category: motion
applies_to: any
source: owner
added: 2026-11-18
---

## When

The user switches between light and dark theme. Every element with a colour transition would fade at its own speed and the page would ripple. Turn transitions off for the frame the theme changes, so the whole page changes at once.

## Values

- Theme change duration: 0 ms.
- Sequence in script: set `data-theme-switching` on `<html>`; change the theme; read `document.documentElement.offsetHeight` to apply the styles; remove the attribute in the next `requestAnimationFrame`.
- The attribute is on the page for one frame only.

## Reference

```css
:root[data-theme-switching] *,
:root[data-theme-switching] *::before,
:root[data-theme-switching] *::after {
  transition: none !important;
}
```

## Reduced motion

The same: the switch is already instant.
