---
name: Directional slides
category: motion
applies_to: any
source: owner
added: 2026-11-18
---

## When

The user steps between views in an order: wizard steps, carousel pages, month to month in a calendar. Forward slides in from the right, back slides in from the left, so the motion matches where they are in the sequence.

## Values

- Distance: 24 px, with opacity 0 → 1. The full width is too much for a view change.
- `--dir: 1` going forward, `--dir: -1` going back.
- Enter 250 ms, leave 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`. Both views run at the same time.

## Reference

```css
.view { --dir: 1; }
.view[data-direction="back"] { --dir: -1; }

.view.entering {
  animation: slide-in 250ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.view.leaving {
  animation: slide-out 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes slide-in {
  from { opacity: 0; translate: calc(var(--dir) * 24px) 0; }
}

@keyframes slide-out {
  to { opacity: 0; translate: calc(var(--dir) * -24px) 0; }
}
```

## Reduced motion

Remove the translate. Crossfade the views: 250 ms in, 200 ms out.
