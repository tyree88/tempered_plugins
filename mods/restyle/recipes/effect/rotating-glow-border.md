---
name: Rotating glow border
category: effect
applies_to: card, button, input
source: https://www.tiktok.com/@aniakubow/video/7668718334518512918
added: 2026-11-20
---

## When

One focal element, such as a featured card, a primary button or a focused input, needs a border of colour that sweeps around it, with a soft glow. A plain custom property cannot animate inside a gradient, because the browser does not know its type. Register it as an angle with `@property` and a `conic-gradient` can rotate in pure CSS, with no image or script.

Do not put it on many elements at once. A page full of spinning borders has no focus.

## Values

- Adds two pseudo-element layers behind the content: `::before` holds the blurred glow, `::after` holds the ring and the card surface.
- `@property --angle` with `syntax: "<angle>"`, `inherits: false`, `initial-value: 0deg`. The `inherits` line is required, or the browser drops the rule.
- Keyframes: `to { --angle: 360deg; }`. Both layers run `spin 3s linear infinite` and stay in step. Linear is right here: a constant spin has no start or end to ease.
- Gradient: `conic-gradient(from var(--angle), #6366f1, #ec4899, #6366f1)`, indigo to pink. Repeat the first colour at the end so the seam does not show.
- Ring width: `border: 2px solid transparent` with the surface on `padding-box` and the gradient on `border-box` (my default; not shown in the source).
- Glow: `filter: blur(16px)` and `opacity: 0.7` (my default; not shown in the source). The glow spills past the box, so a parent with `overflow: hidden` clips it.
- `isolation: isolate` on the element keeps the negative `z-index` layers behind its content but in front of the page.
- Both layers get `pointer-events: none`. With `content: ""` they add nothing to the accessibility tree.
- Browser support: check current support for `@property`. Without it the angle does not animate, and the ring shows a still gradient. That fallback is fine.

## Reference

```css
@property --angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes spin {
  to { --angle: 360deg; }
}

.glow-border {
  position: relative;
  isolation: isolate;
  border-radius: 16px;
  padding: 24px;
  color: #f4f4f5;
}

.glow-border::before,
.glow-border::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  animation: spin 3s linear infinite;
}

/* Soft glow, behind everything. */
.glow-border::before {
  z-index: -2;
  background: conic-gradient(from var(--angle), #6366f1, #ec4899, #6366f1);
  filter: blur(16px);
  opacity: 0.7;
}

/* 2px ring around the card surface. */
.glow-border::after {
  z-index: -1;
  border: 2px solid transparent;
  background:
    linear-gradient(#18181b, #18181b) padding-box,
    conic-gradient(from var(--angle), #6366f1, #ec4899, #6366f1) border-box;
}

@media (prefers-reduced-motion: reduce) {
  .glow-border::before,
  .glow-border::after {
    animation: none;
  }
}
```

```html
<div class="glow-border">…</div>
```

## Reduced motion

The spin stops. The ring and the glow stay, frozen at the start angle.
