---
name: Frosted glass that bends the backdrop
category: effect
applies_to: card, modal, popover, nav
source: https://www.tiktok.com/@aniakubow/video/7680604504600923414
added: 2026-11-20
---

## When

A translucent panel uses `backdrop-filter: blur()` alone and the backdrop turns into flat grey mush, because blur only averages pixels. Real glass also refracts: it shifts what is behind it. An SVG noise displacement filter in front of a light blur pushes the backdrop sideways, so lines and shapes behind the panel wobble, while the small blur keeps text on the panel readable.

## Values

- Before: `backdrop-filter: blur(16px)` or similar, a heavy blur only.
- After: `backdrop-filter: url(#glass-bend) blur(3px) saturate(180%)`. The displacement runs first, then a small 3px blur, then saturation boosts the colour the blur removes.
- Edge highlight: `box-shadow: inset 0 1px 0 #ffffff5c` (one pixel of white at about 36% alpha along the top edge).
- Panel in the demo: 320 × 200 px, `border-radius: 24px`.
- SVG filter: `feTurbulence type="fractalNoise"` into `feDisplacementMap in="SourceGraphic"`. The video cuts off the `baseFrequency` and `scale` numbers. My defaults: `baseFrequency="0.01"`, `numOctaves="2"`, `scale="30"`. Lower frequency gives wider, smoother bends; higher scale gives stronger bends.
- Browser support: `url()` inside `backdrop-filter` renders only in Chromium browsers (Chrome, Edge, Arc). Safari and Firefox do not apply SVG filter references to the backdrop. Declare the plain blur first as the fallback, then the `url()` line, and check Safari and Firefox: if the panel shows no blur at all there, put the `url()` line behind a Chromium-only class.

## Reference

```css
.glass {
  border-radius: 24px;
  background: rgb(255 255 255 / 0.06);
  box-shadow: inset 0 1px 0 #ffffff5c;
  /* Fallback for browsers without SVG backdrop filters. */
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  backdrop-filter: blur(12px) saturate(180%);
  /* Chromium: bend the backdrop, then a light blur. */
  backdrop-filter: url(#glass-bend) blur(3px) saturate(180%);
}
```

```html
<!-- Once per page, anywhere in <body>. -->
<svg width="0" height="0" style="position: absolute" aria-hidden="true">
  <filter id="glass-bend" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" seed="3" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="30" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>

<div class="glass">…</div>
```

## Reduced motion

Not affected. The effect is static. Under `prefers-reduced-transparency: reduce`, replace the panel background with an opaque surface colour and drop `backdrop-filter`.
