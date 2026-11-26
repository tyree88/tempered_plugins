---
name: Shake on error
category: motion
applies_to: input, button
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

The user submits a wrong value, such as a bad password. A red border alone is easy to miss. Add a short sideways shake on the field as well, so the failure is plain at the place they are looking.

## Values

- Keep the error style (the `error` class). Add the shake on top of it.
- Offsets on the x axis, in px: 0, −10, 10, −6, 6, −3, 0. Each swing is smaller than the last.
- Duration: 360 ms, once, never looped. Restart it on each failed submit.
- The video sets no curve; the steps below are evenly spaced.

## Reference

```css
.field.error {
  animation: shake 360ms;
}

@keyframes shake {
  0%, 100% { translate: 0; }
  16.7% { translate: -10px; }
  33.3% { translate: 10px; }
  50% { translate: -6px; }
  66.7% { translate: 6px; }
  83.3% { translate: -3px; }
}
```

## Reduced motion

No shake. Keep the error border colour and the error message.
