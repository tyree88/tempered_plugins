---
name: Neon text glow
category: visual
applies_to: text, heading
source: https://www.tiktok.com/@aniakubow/video/7694329549047254304
added: 2026-11-20
---

## When

Text on a dark surface should look like a lit neon tube. If the letters are the neon colour with one glow, they look like a flat sticker. A real tube is almost white at its core, and the colour shows only in the light that spills out. Make the text white and stack glows that grow wider.

Do not use it on light backgrounds or for body text: white text on a light surface is unreadable.

## Values

- Text colour: `#fff`, the white core.
- Glow: four `text-shadow` layers, all at offset `0 0`, with blur `4px`, `12px`, `28px` and `60px`. Each layer is roughly double the one before.
- The tightest layer (4px) is `#fff`. The other three are the neon colour, `#ff2e88`.
- Flicker: `flicker 4s infinite`, a short dip to `opacity: 0.4` at 94%. Hold `opacity: 1` at 92% and 96%, or the browser fades slowly across the whole cycle instead of dipping.
- One dip every 4 seconds stays far below the rate at which flashing becomes a hazard.
- Contrast: the white core carries the contrast, not the glow. Check the text colour against the background at 4.5:1. During the dip, contrast drops for a moment, so keep the flicker on display text only.

## Reference

```css
.neon {
  color: #fff;
  text-shadow:
    0 0 4px #fff,
    0 0 12px #ff2e88,
    0 0 28px #ff2e88,
    0 0 60px #ff2e88;
  animation: flicker 4s infinite;
}

@keyframes flicker {
  0%, 92%, 96%, 100% { opacity: 1; }
  94% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .neon {
    animation: none;
  }
}
```

```html
<h1 class="neon">Open</h1>
```

## Reduced motion

The flicker stops. The text stays fully lit with its glow.
