---
name: No tween while held
category: motion
applies_to: toggle, input
source: owner
added: 2026-11-18
---

## When

The user holds or drags a slider thumb, a sheet or a draggable card. While the pointer is down the element follows it 1:1; a transition here makes it lag behind the finger. Animate only after release.

## Values

- While held: `transition: none`. The element position equals the pointer position on every frame.
- On release: settle to the snap point in 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, or with the release velocity in a spring (stiffness 400, damping 40); see "Velocity springs".
- Set `data-dragging` on pointerdown; remove it on pointerup and pointercancel.

## Reference

```css
.thumb {
  translate: var(--x, 0px) 0;
  transition: translate 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.slider[data-dragging] .thumb {
  transition: none;
}
```

## Reduced motion

Keep the 1:1 follow: the user moves the element. On release, jump to the snap point with no transition.
