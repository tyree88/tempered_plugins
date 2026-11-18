---
name: Stagger as details settle
category: motion
applies_to: modal, popover, list
source: owner
added: 2026-11-18
---

## When

A card, dialog or panel enters with secondary content inside: a caption, a meta line, buttons. The container lands first; the details land just after it, so the eye reads the main shape before the small parts.

## Values

- Container: 250 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, opacity 0 → 1, scale 0.95 → 1.
- Details: start 60 ms after the container, then 30 ms between each detail.
- Each detail: 200 ms, same curve, opacity 0 → 1, translate 4 px → 0 on the y axis.

## Reference

```css
.card {
  animation: card-in 250ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.card .detail {
  animation: detail-in 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
  animation-delay: calc(60ms + var(--i, 0) * 30ms);
}

@keyframes card-in {
  from { opacity: 0; scale: 0.95; }
}

@keyframes detail-in {
  from { opacity: 0; translate: 0 4px; }
}
```

## Reduced motion

Remove the scale, the translate and the delays. The container and its details fade in together over 250 ms.
