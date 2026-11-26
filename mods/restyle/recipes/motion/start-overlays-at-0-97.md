---
name: Start overlays at 0.97
category: motion
applies_to: popover, menu, modal
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

A dialog, popover or menu appears. Growing it from scale 0 makes it balloon out of a point, which reads as cartoonish. Start it almost at full size and fade it in, so it seems to come into focus where it already was.

## Values

- Start: opacity 0, scale 0.97. End: opacity 1, scale 1.
- Never start from scale 0.
- Enter 250 ms, `cubic-bezier(0.32, 0.72, 0, 1)`.

## Reference

```css
@keyframes overlay-enter {
  from { opacity: 0; scale: 0.97; }
}

.dialog {
  animation: overlay-enter 250ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

## Reduced motion

Keep the opacity fade. Leave out the scale: start and end at scale 1.

## Patch

```css
& {
  animation: restyle-overlay-enter 250ms cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes restyle-overlay-enter {
  from {
    opacity: 0;
    scale: 0.97;
  }
}

@keyframes restyle-overlay-fade {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  & {
    animation-name: restyle-overlay-fade;
  }
}
```
