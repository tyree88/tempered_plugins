---
name: Scale to 0.97 on press
category: motion
applies_to: button, toggle
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

A button, toggle or card is pressed. Shrink it a little while the pointer is down, so the press answers at once, before any result comes back.

## Values

- Pressed scale: 0.97.
- Transition on `scale` only: 150 ms, `ease-out`, the same both ways.
- Scale from the centre (the default `transform-origin`).

## Reference

```css
button {
  transition: scale 150ms ease-out;
}

button:active {
  scale: 0.97;
}
```

## Reduced motion

Do not scale. Show the press with a background colour change on `:active` instead.
