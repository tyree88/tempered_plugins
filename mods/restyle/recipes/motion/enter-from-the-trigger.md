---
name: Enter from the trigger
category: motion
applies_to: popover, menu, tooltip
source: owner
added: 2026-11-18
---

## When

A popover, menu or tooltip opens from a button. Set the scale origin to the point nearest the trigger, so the element grows out of the thing that opened it. Dialogs that are not tied to a trigger keep the centre origin.

## Values

- `transform-origin`: the edge and alignment that face the trigger. Below the trigger and start-aligned: `top left`. Above and centred: `bottom center`.
- Scale 0.95 → 1, opacity 0 → 1.
- 200 ms (tooltip 150 ms), `cubic-bezier(0.23, 1, 0.32, 1)`.

## Reference

```css
.popover[data-side="bottom"][data-align="start"] { transform-origin: top left; }
.popover[data-side="bottom"][data-align="center"] { transform-origin: top center; }
.popover[data-side="top"][data-align="center"] { transform-origin: bottom center; }
.popover[data-side="right"][data-align="start"] { transform-origin: top left; }
.popover[data-side="left"][data-align="start"] { transform-origin: top right; }
```

## Reduced motion

The origin has no effect without the scale. Keep the opacity fade only.
