---
name: Shake on error
category: motion
applies_to: input, button
source: owner
added: 2026-11-18
---

## When

The user submits a field or form that is wrong: a bad password, a code that does not match. A short sideways shake says "no" at the place they are looking. Always pair it with an error message.

## Values

- Offsets on the x axis: 0, −6, 6, −4, 4, −2, 0 px.
- Duration: 300 ms, `cubic-bezier(0.77, 0, 0.175, 1)` between each step. Once, never looped.
- Restart it on each failed submit by removing and adding the class.

## Reference

```css
.field.has-error {
  animation: shake 300ms cubic-bezier(0.77, 0, 0.175, 1);
}

@keyframes shake {
  0%, 100% { translate: 0 0; }
  16% { translate: -6px 0; }
  33% { translate: 6px 0; }
  50% { translate: -4px 0; }
  66% { translate: 4px 0; }
  83% { translate: -2px 0; }
}
```

## Reduced motion

No shake. Show the error colour on the border and the error message only.
