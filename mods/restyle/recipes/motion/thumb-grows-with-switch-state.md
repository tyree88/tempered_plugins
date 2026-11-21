---
name: Switch thumb grows 16, 24, 28 by state
category: motion
applies_to: toggle
source: https://www.tiktok.com/@aniakubow/video/7706607389323119894
added: 2026-11-20
---

## When

A switch whose knob only slides left and right reads as dated. Give the thumb a size for each state: small and quiet when off, full when on, a bit bigger while the finger is down. The size change is what makes the switch feel alive.

## Values

- Track: 52 × 32 px, fully round. Off: 2 px outline, no fill. On: filled with the primary colour, outline gone.
- Thumb diameter: off 16 px, on 24 px, pressed 28 px (off or on). Off thumb uses the outline colour; on thumb uses the on-primary colour, with a check icon inside.
- Thumb centre: 16 px from the left edge when off, 36 px when on. The centre does not move on press, so press is a pure scale.
- Implementation: one 28 px thumb, scaled to 16/28 = 0.571 (off), 24/28 = 0.857 (on), 1 (pressed); `translate` 20 px when on. Only `transform`-type properties animate.
- Easing: the catalog ease-out, `cubic-bezier(0.32, 0.72, 0, 1)`, 250 ms. The source shows a small overshoot and no duration; a switch is everyday UI, so this recipe drops the overshoot, and 250 ms is its own choice.
- State selectors: `:has(:checked)` for on, `:active` for pressed. `:has()` works in Chrome/Edge 105+, Safari 15.4+, Firefox 121+. Fallback for older browsers: put the input directly before the track and use `input:checked + .track`.
- iOS Safari applies `:active` on touch only if the page has a `touchstart` listener (an empty one is enough).

## Reference

```css
.switch {
  --track-on: #6750a4;
  --thumb-on: #ffffff;
  --outline: #79747e;
  position: relative;
  display: inline-block;
  width: 52px;
  height: 32px;
  border-radius: 16px;
  box-shadow: inset 0 0 0 2px var(--outline);
  background: transparent;
  cursor: pointer;
  transition: background-color 250ms, box-shadow 250ms;
}

/* Keep the real checkbox for keyboard and screen readers. */
.switch input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.switch .thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--outline);
  pointer-events: none;
  scale: 0.571;
  translate: 0 0;
  transition:
    scale 250ms cubic-bezier(0.32, 0.72, 0, 1),
    translate 250ms cubic-bezier(0.32, 0.72, 0, 1),
    background-color 250ms;
}

.switch .thumb svg {
  width: 16px;
  height: 16px;
  opacity: 0;
  transition: opacity 150ms;
}

.switch:has(:checked) {
  background: var(--track-on);
  box-shadow: inset 0 0 0 0 var(--outline);
}

.switch:has(:checked) .thumb {
  background: var(--thumb-on);
  scale: 0.857;
  translate: 20px 0;
}

.switch:has(:checked) .thumb svg {
  opacity: 1;
}

.switch:active .thumb {
  scale: 1;
}

.switch:has(:focus-visible) {
  outline: 2px solid var(--track-on);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .switch,
  .switch .thumb,
  .switch .thumb svg {
    transition-duration: 0ms;
  }
}
```

```html
<label class="switch">
  <input type="checkbox" role="switch" />
  <span class="thumb" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  </span>
</label>
```

## Reduced motion

The thumb takes its size, place and colour for each state at once, with no slide, scale or overshoot. The three sizes stay, so off, on and pressed still look different.
