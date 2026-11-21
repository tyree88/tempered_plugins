---
name: Overlap old and new states
category: motion
applies_to: button, icon, text
source: owner
added: 2026-11-18
---

## When

One state replaces another in the same place: a label changes, an icon swaps, a value updates. Run the exit and the entrance at the same time. In sequence, the gap between them reads as a blink.

## Values

- Both start on the same frame. No delay on the entrance.
- Old state: 160 ms out. New state: 200 ms in. Both `cubic-bezier(0.32, 0.72, 0, 1)`.
- Stack both states in one grid cell so the layout does not jump.

## Reference

```css
.swap {
  display: grid;
}

.swap > * {
  grid-area: 1 / 1;
  transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.swap > [data-state="off"] {
  opacity: 0;
  transition-duration: 160ms;
}
```

## Reduced motion

Keep the overlapping opacity crossfade. It does not move anything.
