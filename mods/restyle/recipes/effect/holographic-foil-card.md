---
name: Holographic foil card
category: effect
applies_to: card, image
source: https://www.tiktok.com/@aniakubow/video/7690988081171664160
added: 2026-11-20
---

## When

A ticket, badge or collectible card should look like printed holographic foil: colours that shift as the card tilts. A rainbow layer three times wider than the card blends over it with `mix-blend-mode: color-dodge`. Colour dodge brightens light areas a lot and dark areas only a little, so the logo and line art glow while the dark ground stays dark. The pointer position slides the rainbow, so a different band sits over the card at each angle.

Do not use it on text-heavy cards or on every card in a list.

## Values

- Adds one pseudo-element layer, `::after`, that holds the rainbow, plus a few lines of script that set `--x` (0 to 1) from the pointer.
- Layer width: `300%` of the card. The card clips it with `overflow: hidden`.
- Slide: `translate: calc(var(--x) * -66.667%) 0`, so the layer moves by transform only. At `--x: 0.5` the middle band shows.
- Gradient: `linear-gradient(105deg, #ff7eb3, #ffd36e, #7afcff, #b18cff, #ff7eb3)` (my default; not shown in the source).
- Blend: `mix-blend-mode: color-dodge` at `opacity: 0.6` (opacity is my default; not shown in the source). `isolation: isolate` on the card keeps the blend inside it.
- Tilt: `perspective(800px) rotateY()` up to 8deg each way (my default; not shown in the source).
- Easing: 200ms `cubic-bezier(0.32, 0.72, 0, 1)` on `transform` and `translate`, to smooth pointer jitter.
- The layer gets `pointer-events: none`. With `content: ""` it adds nothing to the accessibility tree.
- Contrast: the bright bands can wash out light text. Check text against the brightest band at 4.5:1. If it fails, lift the text above the foil with `position: relative; z-index: 1`.

## Reference

```css
.foil {
  --x: 0.5;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-radius: 16px;
  background: #17181f;
  transform: perspective(800px) rotateY(calc((var(--x) - 0.5) * 16deg));
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.foil::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 300%;
  pointer-events: none;
  background: linear-gradient(105deg, #ff7eb3, #ffd36e, #7afcff, #b18cff, #ff7eb3);
  mix-blend-mode: color-dodge;
  opacity: 0.6;
  translate: calc(var(--x) * -66.667%) 0;
  transition: translate 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .foil {
    transform: none;
  }

  .foil::after {
    translate: -33.333% 0;
  }
}
```

```html
<div class="foil">…</div>

<script>
  const card = document.querySelector('.foil')
  card.addEventListener('pointermove', (e) => {
    const box = card.getBoundingClientRect()
    card.style.setProperty('--x', ((e.clientX - box.left) / box.width).toFixed(3))
  })
  card.addEventListener('pointerleave', () => card.style.setProperty('--x', '0.5'))
</script>
```

## Reduced motion

The card does not tilt and the foil does not slide. The middle band of the rainbow stays fixed over the card, so the foil look remains.
