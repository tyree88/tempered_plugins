---
name: Perspective for 3D flips
category: motion
applies_to: image, any
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

A flat object turns in 3D: a payment card flips to its back, a tile turns over to show detail. Without perspective the turn looks like the object gets thin and wide again. With perspective the near edge grows and the far edge shrinks, so it reads as a solid thing in space.

## Values

- `perspective: 700px` on the parent of the turning object (value shown in the video).
- Turn: `rotate: y 0deg` → `y 180deg`. Both faces get `backface-visibility: hidden`; the back face starts at `y 180deg`.
- 300 ms, `cubic-bezier(0.77, 0, 0.175, 1)`. The video shows no duration; this is the catalog default for a move of 100 px or more.

## Reference

```css
.card-scene {
  perspective: 700px;
}

.card {
  display: grid;
  transform-style: preserve-3d;
  transition: rotate 300ms cubic-bezier(0.77, 0, 0.175, 1);
}

.card.is-flipped {
  rotate: y 180deg;
}

.card > .face {
  grid-area: 1 / 1;
  backface-visibility: hidden;
}

.card > .back {
  rotate: y 180deg;
}
```

## Reduced motion

No turn. Crossfade the front face out (160 ms) and the back face in (200 ms) at the same time.
