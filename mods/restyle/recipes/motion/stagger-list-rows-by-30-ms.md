---
name: Stagger list rows by 30 ms
category: motion
applies_to: list
source: owner
added: 2026-11-18
---

## When

A list, menu or grid of results appears at once. A small delay per row lets the eye read it top to bottom. Use it on first appearance only, not on every re-render.

## Values

- Delay: 30 ms per row. Stop adding delay after row 10 (300 ms), so long lists do not drag.
- Each row: 200 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, opacity 0 → 1, translate 8 px → 0 on the y axis.
- Set `--i` to the row index (0, 1, 2 …) on each row.

## Reference

```css
.row {
  animation: row-in 200ms cubic-bezier(0.32, 0.72, 0, 1) both;
  animation-delay: calc(min(var(--i, 0), 10) * 30ms);
}

@keyframes row-in {
  from {
    opacity: 0;
    translate: 0 8px;
  }
}
```

## Reduced motion

Remove the delay and the translate. All rows fade in together over 200 ms.
