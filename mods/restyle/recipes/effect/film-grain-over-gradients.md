---
name: Film grain over gradients
category: effect
applies_to: background, card, image
source: https://www.tiktok.com/@aniakubow/video/7699891011446656278
added: 2026-11-20
---

## When

A large, smooth gradient looks flat and synthetic, and on many screens it shows visible steps of colour (banding). A fine layer of noise breaks up the steps and gives the surface a printed, tactile look. An SVG `feTurbulence` filter makes the noise, so there is no image file to load.

Do not use it on small controls or flat single-colour surfaces, where grain reads as dirt.

## Values

- Adds one pseudo-element layer, `::before`, that holds a tiled noise texture between the background and the content.
- Noise: `feTurbulence type="fractalNoise" baseFrequency="0.8"` in a 200 × 200 SVG tile, delivered as a data URL and repeated.
- `numOctaves="3"` and `stitchTiles="stitch"`, so the tile edges join without seams (my default; not shown in the source).
- Blend: `mix-blend-mode: overlay` at `opacity: 0.15`. Raise it towards 0.5 for strong colour mixes. Near 1 it looks like TV static.
- In a data URL, encode `#` as `%23`, `<` as `%3C`, `>` as `%3E` and `%` as `%25`.
- The parent gets `position: relative` and `isolation: isolate`. The layer sits at `z-index: -1`: above the parent's gradient, below its text, so text stays crisp (my default; the source puts the layer on top of everything).
- The layer gets `pointer-events: none`. With `content: ""` it adds nothing to the accessibility tree.

## Reference

```css
.grain {
  position: relative;
  isolation: isolate;
  background: linear-gradient(135deg, #0f3d3e, #e0743a);
}

.grain::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
  opacity: 0.15;
  mix-blend-mode: overlay;
}
```

```html
<section class="grain">…</section>
```

## Reduced motion

Not affected.
