---
name: Scale to 0.97 on press
category: motion
applies_to: button, toggle
source: owner
added: 2026-11-18
---

## When

A button, toggle or card is pressed. A small scale-down tells the user the press landed before any result comes back.

## Values

- Pressed scale: 0.97. Use 0.97 for every pressable element.
- Duration: 150 ms down and 150 ms back, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Scale from the centre (`transform-origin: center`).

## Reference

```css
.button {
  transition: scale 150ms cubic-bezier(0.23, 1, 0.32, 1);
}

.button:active {
  scale: 0.97;
}
```

## Reduced motion

Do not scale. Show the press with a background colour change on `:active` instead.
