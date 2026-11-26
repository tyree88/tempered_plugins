---
name: Reuse the same layoutId
category: motion
applies_to: list, button
source: owner
added: 2026-11-18
---

## When

One visual thing moves between two places in the tree: a tab underline goes to the new tab, a thumbnail grows into a detail view. Give both renders the same `layoutId`, so Motion animates one element from the old box to the new one. Without Motion, give both elements the same `view-transition-name` and change the DOM inside `document.startViewTransition()`.

## Values

- Spring: duration 0.5 s, bounce 0.
- CSS equivalent: `view-transition-name: tab-indicator` on the element; `::view-transition-group(tab-indicator)` with `animation-duration: 300ms` and `animation-timing-function: cubic-bezier(0.77, 0, 0.175, 1)`.
- One `layoutId` (or one `view-transition-name`) may be on the page only once at a time.

## Reference

```jsx
import { motion } from "motion/react"

export function Tabs({ tabs, active, onSelect }) {
  return (
    <div role="tablist">
      {tabs.map((tab) => (
        <button key={tab} role="tab" onClick={() => onSelect(tab)}>
          {tab}
          {tab === active && (
            <motion.span
              layoutId="tab-indicator"
              className="indicator"
              transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}
```

## Reduced motion

Wrap the app in `<MotionConfig reducedMotion="user">`: Motion then skips the move and the indicator appears in its new place. For view transitions, set `animation: none` on `::view-transition-group(*)` inside the reduced-motion media query.
