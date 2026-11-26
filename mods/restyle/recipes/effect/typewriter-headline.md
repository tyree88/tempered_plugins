---
name: Typewriter headline
category: effect
applies_to: heading, text
source: https://www.tiktok.com/@aniakubow/video/7667992779070442774
added: 2026-11-20
---

## When

A short headline should appear one character at a time, as if someone types it, with no script. The box grows from zero to the full text width in jumps of one character, and it clips the rest. The full text stays in the DOM, so screen readers read it at once.

Do not use it on body text, on text that wraps, or on text whose length changes, such as translated copy, unless the character count changes with it.

## Values

- Adds no markup. It sets one custom property, `--chars`, to the number of characters in the text, spaces included.
- Width: `calc(var(--chars) * 1ch)`, with `white-space: nowrap` and `overflow: hidden`.
- Font: a monospace font, such as `ui-monospace, monospace`. `1ch` is the width of one character only when every character has the same width. Keep `letter-spacing: 0`.
- Keyframes: `from { width: 0; }`. The end state is the element's own width.
- Timing: `steps(var(--chars))`, so the width jumps one character per step instead of sliding. Duration 2s.
- Fill `both`, so the headline stays hidden during any delay.
- Keep the text short. A one-line box with `nowrap` overflows on a phone if the text is longer than the screen.

## Reference

```css
.typewriter {
  width: calc(var(--chars) * 1ch);
  font-family: ui-monospace, monospace;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  animation: type 2s steps(var(--chars)) both;
}

@keyframes type {
  from { width: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .typewriter {
    animation: none;
  }
}
```

```html
<h1 class="typewriter" style="--chars: 11">Hello world</h1>
```

## Reduced motion

The animation does not run. The full headline shows at once.
