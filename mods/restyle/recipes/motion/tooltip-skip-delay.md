---
name: Tooltip skip delay
category: motion
applies_to: tooltip
source: owner
added: 2026-11-18
---

## When

A toolbar or icon row where each item has a tooltip. The first tooltip waits, so a pointer passing by does not set off a flash. Once one is open, the user is reading them: the next ones in the same group open at once.

## Values

- First tooltip in a group: 600 ms delay, then 150 ms in, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Skip window: for 300 ms after a tooltip in the group closes, the next one opens with 0 ms delay and 0 ms duration.
- Exit: 120 ms, no delay.
- In script: set `data-warm` on the group when a tooltip opens; remove it 300 ms after the last one closes.

## Reference

```css
.tooltip {
  opacity: 0;
  transition: opacity 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

.trigger:hover .tooltip,
.trigger:focus-visible .tooltip {
  opacity: 1;
  transition-duration: 150ms;
  transition-delay: 600ms;
}

.tooltip-group[data-warm] .trigger:hover .tooltip,
.tooltip-group[data-warm] .trigger:focus-visible .tooltip {
  transition-duration: 0ms;
  transition-delay: 0ms;
}
```

## Reduced motion

Keep the delays: they are timing, not motion. Keep the opacity fade; tooltips do not move or scale.
