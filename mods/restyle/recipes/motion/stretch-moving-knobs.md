---
name: Stretch moving knobs 12%
category: motion
applies_to: toggle
source: owner
added: 2026-11-18
---

## When

The knob of a switch or slider travels from one end to the other. Widening it a little while it moves makes it feel pulled by the gesture, not slid on a rail.

## Values

- Stretch: width × 1.12 at the middle of the travel, back to × 1 at the end. Height does not change.
- Travel: 200 ms, `cubic-bezier(0.77, 0, 0.175, 1)` (a short on-screen move).
- Example: a 20 px knob is 22.4 px wide at mid-travel.

## Reference

```css
.switch .knob {
  width: 20px;
  height: 20px;
  translate: 0 0;
  transition: translate 200ms cubic-bezier(0.77, 0, 0.175, 1);
}

.switch input:checked + .knob {
  translate: 20px 0;
  animation: knob-stretch-on 200ms cubic-bezier(0.77, 0, 0.175, 1);
}

.switch input:not(:checked) + .knob {
  animation: knob-stretch-off 200ms cubic-bezier(0.77, 0, 0.175, 1);
}

@keyframes knob-stretch-on { 50% { scale: 1.12 1; } }
@keyframes knob-stretch-off { 50% { scale: 1.12 1; } }
```

The two keyframe names are identical on purpose: a new name restarts the animation on each change.

## Reduced motion

Remove the stretch animation. The knob still moves to its new end over 200 ms, or jumps if the move itself is too much.
