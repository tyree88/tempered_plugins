---
name: Wavy progress bar with a CSS mask
category: effect
applies_to: progress
source: https://www.tiktok.com/@aniakubow/video/7706970509791022358
added: 2026-11-20
---

## When

A determinate progress bar that should feel alive while work runs, in the newer Android style: the filled part is a travelling sine wave, the remaining part is a thin flat track with a dot at the end. Use one plain element and a mask, not an SVG component or a Lottie file.

## Values

- Filled part: a plain block, 10 px tall, width = progress (for example `var(--value)`), solid fill colour.
- Mask: an inline SVG of exactly one wave period, `viewBox="0 0 20 10"`, path `M0 5 Q5 0 10 5 T20 5`, stroke 4, round caps, no fill.
- `mask-size: 20px 100%`, `mask-repeat: repeat-x`. The tile width must equal one period (20 px), or the loop shows a seam.
- Motion: animate `mask-position` from `0 0` to `20px 0`, 0.6 s, `linear`, infinite. Moving by one full period makes the loop seamless (15 px jumps).
- Rest of the track: 4 px tall, a muted colour, 2 px radius, 4 px gap after the wave, `flex: 1`. A 4 px round dot in the fill colour sits at its far end.
- Support: unprefixed `mask` ships in Chrome/Edge 120+, Firefox 53+, Safari 15.4+. Keep the `-webkit-mask` lines for older Chromium. Without mask support the filled part shows as a solid 10 px bar, which still reads as progress.
- Keep `role="progressbar"` and `aria-valuenow` on the wrapper; the wave is decoration only.

## Reference

```css
.progress {
  --value: 60%;
  --fill: #adc6ff;
  --track: #3f4759;
  display: flex;
  align-items: center;
}

.progress-wave {
  --wave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 10'%3E%3Cpath d='M0 5 Q5 0 10 5 T20 5' fill='none' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E");
  width: var(--value);
  height: 10px;
  background: var(--fill);
  -webkit-mask: var(--wave) 0 0 / 20px 100% repeat-x;
  mask: var(--wave) 0 0 / 20px 100% repeat-x;
  animation: wave-travel 0.6s linear infinite;
}

.progress-rest {
  flex: 1;
  height: 4px;
  margin-left: 4px;
  border-radius: 2px;
  background: var(--track);
}

.progress-rest::after {
  content: "";
  float: right;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--fill);
}

@keyframes wave-travel {
  to {
    -webkit-mask-position: 20px 0;
    mask-position: 20px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-wave { animation: none; }
}
```

```html
<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60" style="--value: 60%">
  <div class="progress-wave"></div>
  <div class="progress-rest"></div>
</div>
```

## Reduced motion

The wave stops travelling: `animation: none` leaves a still wave shape. Width changes for new progress values still apply, with no transition.
