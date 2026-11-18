---
name: Rubber band past bounds
category: motion
applies_to: list, modal
source: owner
added: 2026-11-18
---

## When

The user drags a list, sheet or carousel past its first or last position. Let it move a little with growing resistance, then spring back on release. A hard stop feels broken; free movement hides the limit.

## Values

- Elastic factor: 0.2. Past the bound, the element moves 20% of the pointer distance.
- Return on release: spring, stiffness 400, damping 40 (no overshoot).
- Inside the bounds the element follows the pointer 1:1.

## Reference

```jsx
import { motion } from "motion/react"

export function Sheet({ children }) {
  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
    >
      {children}
    </motion.div>
  )
}
```

## Reduced motion

Keep the resistance: the user drives the movement. The return spring has no overshoot, so keep it too.
