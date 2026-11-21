---
name: Tooltip skip delay
category: motion
applies_to: tooltip
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

A toolbar or icon row where each item has a tooltip. If every tooltip waits for its full delay, moving along the row feels slow. Delay only the first one. While the user moves from item to item, open the next tooltips at once.

## Values

- First tooltip in a group: 600 ms delay.
- Skip window: 300 ms. If the next tooltip opens within 300 ms of the last one closing, it opens with no delay.
- In Radix: `<Tooltip.Provider delayDuration={600} skipDelayDuration={300}>`. A skip of 0 turns the skip off.
- In plain CSS, set `data-warm` on the group when a tooltip opens. Remove it 300 ms after the last one closes.

## Reference

```css
/* A 0 ms transition still waits for its delay; closing has no delay. */
.tooltip {
  opacity: 0;
  transition: opacity 0ms;
}

.trigger:hover .tooltip,
.trigger:focus-visible .tooltip {
  opacity: 1;
  transition-delay: 600ms;
}

.tooltip-group[data-warm] .trigger:hover .tooltip,
.tooltip-group[data-warm] .trigger:focus-visible .tooltip {
  transition-delay: 0ms;
}
```

## Reduced motion

Keep the delays: they are timing, not motion. Tooltips do not move or scale, so nothing else changes.
