---
name: Pulse to confirm success
category: motion
applies_to: button, icon
source: owner
added: 2026-11-18
---

## When

An action finishes well: saved, copied, sent. One soft ring that grows and fades from the control confirms it without a toast.

## Values

- Ring: a pseudo-element the size of the control, scale 1 → 1.15, opacity 0.4 → 0.
- Duration: 400 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, once. Never loop it.
- Ring colour: the success colour. The control itself does not scale, so it does not fight the 0.97 press scale.

## Reference

```css
.control {
  position: relative;
}

.control.is-success::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid currentColor;
  pointer-events: none;
  animation: success-ring 400ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}

@keyframes success-ring {
  from { opacity: 0.4; scale: 1; }
  to { opacity: 0; scale: 1.15; }
}
```

## Reduced motion

No ring. Change the icon or label to the success state (for example a check mark) with a 200 ms opacity crossfade.
