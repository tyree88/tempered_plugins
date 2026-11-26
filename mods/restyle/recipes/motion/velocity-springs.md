---
name: Velocity springs
category: motion
applies_to: modal, toggle, list
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

The user flicks or releases a dragged sheet, card or player panel. A fixed tween (for example 300 ms `easeInOut`) ignores how fast the hand moved, so the release feels mechanical. Settle with a spring that starts at the speed of the drag.

## Values

- Spring: `duration: 0.5` (seconds), `bounce: 0`.
- `velocity`: the current velocity of the dragged value (`y.getVelocity()`).
- Not this: `{ duration: 0.3, ease: "easeInOut" }`.

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
      onDragEnd={() => {
        animate(y, 0, {
          type: "spring",
          duration: 0.5,
          bounce: 0,
          velocity: y.getVelocity(),
        })
      }}
    >
      {children}
    </motion.div>
  )
}
```

## Reduced motion

Keep the drag: the user drives it. On release, set the end position with no spring (`y.set(0)`).
