---
name: Directional slides
category: motion
applies_to: any
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

The user steps between views in an order: stepper or wizard steps, carousel pages. A crossfade hides which way they moved. Slide the views instead: on Next, the new step comes in from the right and the old one leaves to the left; on Back, the reverse.

## Values

- Distance: the full width of the view (`translate: 100%` and `-100%`). Clip the container so the off-screen step does not show.
- Transition on `translate` only: 350 ms, `cubic-bezier(0.77, 0, 0.175, 1)`, the same for the step that enters and the step that leaves.
- Next: entering step starts at 100%, leaving step ends at −100%. Back: entering step starts at −100%, leaving step ends at 100%.

## Reference

```css
.steps { overflow: clip; }

.step {
  transition: translate 350ms cubic-bezier(0.77, 0, 0.175, 1);
}

.next .enter,
.back .exit { translate: 100%; }

.next .exit,
.back .enter { translate: -100%; }
```

## Reduced motion

Remove the translate. Crossfade the steps with opacity over 350 ms.
