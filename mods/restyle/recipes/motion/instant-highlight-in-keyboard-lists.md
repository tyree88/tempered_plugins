---
name: Instant highlight in keyboard lists
category: motion
applies_to: list, menu
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

The user moves through a command palette, a menu or a list of results with the arrow keys, many times a day. A highlight that slides or fades from row to row lags behind the keys when they are pressed fast. Move it at once.

## Values

- Highlight change on arrow keys: 0 ms. No transition on the background, the position or the opacity of the active row.
- The same for pointer hover in that list.
- Opening and closing the palette itself keeps its own entrance and exit (see "Dropdowns at 150–250 ms").
- The video shows the before and after but no numbers. 0 ms is the only value that matches "instant".

## Reference

```css
.palette [role="option"] {
  transition: none;
}

.palette [role="option"][aria-selected="true"] {
  background: var(--row-active);
}
```

## Reduced motion

Not affected. The highlight is already instant.
