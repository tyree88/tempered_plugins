---
name: Smooth height auto
category: motion
applies_to: list, text
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

An accordion, a "show more" block or a details panel opens to its natural height. By default the browser cannot animate to `height: auto`, so the panel jumps open. Set `interpolate-size: allow-keywords` and the same height transition animates.

## Values

- `interpolate-size: allow-keywords` on `:root` (the default is `numeric-only`).
- Closed: `height: 0; overflow: clip`. Open: `height: auto`.
- Transition on `height`: 250 ms, `cubic-bezier(0.77, 0, 0.175, 1)`, the same both ways.
- Where `interpolate-size` is not supported the panel still opens, without the animation.

## Reference

```css
:root { interpolate-size: allow-keywords; }

.answer {
  height: 0;
  overflow: clip;
  transition: height 250ms cubic-bezier(0.77, 0, 0.175, 1);
}

.open .answer { height: auto; }
```

## Reduced motion

Open and close without a height transition (`transition: none`).
