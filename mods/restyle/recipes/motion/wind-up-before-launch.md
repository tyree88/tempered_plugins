---
name: Wind-up before launch
category: motion
applies_to: icon, button
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

An icon flies off to show that something left: a paper plane on send, an arrow on upload, a rocket on publish. A small pull back against the direction of travel, just before the launch, tells the eye where the object will go.

## Values

- Wind-up: move 4 px opposite to the launch direction and scale to 0.9. 100 ms, `cubic-bezier(0.77, 0, 0.175, 1)`.
- Launch: from the wound-up pose to off the control (for example 48 px up and right), opacity 1 → 0. 200 ms, `cubic-bezier(0.32, 0.72, 0, 1)`.
- Keep the wind-up short: one third of the whole move or less, so the press still feels instant.
- The video shows the effect but no numbers. Distances and the 100 ms wind-up are chosen values; the curves are the catalog ease-in-out and ease-out defaults.

## Reference

```css
.send-icon.is-sending {
  animation: send-launch 300ms forwards;
}

@keyframes send-launch {
  0% { translate: 0 0; scale: 1; opacity: 1;
       animation-timing-function: cubic-bezier(0.77, 0, 0.175, 1); }
  33% { translate: -4px 4px; scale: 0.9; opacity: 1;
        animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1); }
  100% { translate: 48px -48px; scale: 0.9; opacity: 0; }
}
```

## Reduced motion

No wind-up and no flight. Fade the icon out over 160 ms, then show the sent state.
