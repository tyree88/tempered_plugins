---
name: Smooth height auto
category: motion
applies_to: list, text
source: owner
added: 2026-11-18
---

## When

An accordion, a "show more" block or a details panel opens to its natural height. Browsers do not animate to `height: auto` by default; tell them to, and fall back to a grid row from `0fr` to `1fr` where they cannot.

## Values

- `interpolate-size: allow-keywords` on `:root`, then a plain `height` transition from 0 to `auto`.
- Fallback: `grid-template-rows: 0fr` → `1fr`; the child needs `min-height: 0` and `overflow: hidden`.
- Open 250 ms, close 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`.

## Reference

```css
@supports (interpolate-size: allow-keywords) {
  :root { interpolate-size: allow-keywords; }

  .panel {
    height: 0;
    overflow: hidden;
    transition: height 200ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .panel.is-open {
    height: auto;
    transition-duration: 250ms;
  }
}

@supports not (interpolate-size: allow-keywords) {
  .panel {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 200ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .panel.is-open {
    grid-template-rows: 1fr;
    transition-duration: 250ms;
  }

  .panel > .panel-inner {
    min-height: 0;
    overflow: hidden;
  }
}
```

## Reduced motion

Open and close without a height transition (`transition: none`). Fade the content in over 250 ms if it needs a cue.
