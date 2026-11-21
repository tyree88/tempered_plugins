---
name: Rubber band past bounds
category: motion
applies_to: list, modal
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-18
---

## When

The user drags a carousel, list or sheet past its first or last position. A hard stop (offset stays 0) feels broken. Let it move a little with growing resistance, then spring back on release.

## Values

- `pull`: the px dragged past the end.
- Dead zone: the first 12 px of pull move nothing. `over = max(0, pull − 12)`.
- `offset = 64 × over / (over + 150)`. The offset never reaches 64 px; at 150 px of `over` it is 32 px.
- On release, spring the offset back to 0. The video does not show the spring values.

## Reference

```jsx
import { motion, useMotionValue, animate } from "motion/react"

const rubber = (pull) => {
  const over = Math.max(0, pull - 12)
  return 64 * (over / (over + 150))
}

export function EndEdge({ children }) {
  const x = useMotionValue(0)

  return (
    <motion.div
      style={{ x }}
      onPan={(event, info) => {
        const pull = Math.abs(info.offset.x)
        x.set(Math.sign(info.offset.x) * rubber(pull))
      }}
      onPanEnd={() => animate(x, 0, { type: "spring", bounce: 0 })}
    >
      {children}
    </motion.div>
  )
}
```

## Reduced motion

Keep the resistance: the user drives the movement. On release, set the offset to 0 with no spring.
