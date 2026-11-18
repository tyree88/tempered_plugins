---
name: Velocity springs
category: motion
applies_to: modal, toggle, list
source: owner
added: 2026-11-18
---

## When

The user flicks or releases a dragged sheet, card or carousel. The settle animation must start at the speed the hand left it, not from 0. A fixed-duration tween from rest makes the element stop, then start again.

## Values

- Spring: stiffness 400, damping 40, mass 1 (no overshoot), with `velocity` = the release velocity in px/s.
- Dismiss when the release velocity is over 500 px/s or the drag distance is over 120 px; else return to 0.
- Turn off Motion's own momentum (`dragMomentum={false}`), so only this spring runs.

## Reference

```jsx
import { motion, useMotionValue, animate } from "motion/react"

export function Sheet({ children }) {
  const y = useMotionValue(0)

  return (
    <motion.div
      drag="y"
      dragMomentum={false}
      style={{ y }}
      onDragEnd={(event, info) => {
        const dismiss = info.velocity.y > 500 || info.offset.y > 120
        animate(y, dismiss ? 400 : 0, {
          type: "spring",
          stiffness: 400,
          damping: 40,
          velocity: info.velocity.y,
        })
      }}
    >
      {children}
    </motion.div>
  )
}
```

## Reduced motion

Keep the drag: the user drives it. On release, set the end position with no spring (`y.set(dismiss ? 400 : 0)`), and fade a dismissed sheet out over 200 ms.
