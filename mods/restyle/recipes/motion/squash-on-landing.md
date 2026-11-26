---
name: Squash on landing
category: motion
applies_to: icon, image, list
source: https://www.tiktok.com/@charles.unemployed
added: 2026-11-20
---

## When

An item drops into place: an app icon lands in a dock, a chip falls into a tray, a card settles into a slot. A short flatten-and-recover at the moment of contact gives the item weight; an item that stops rigid looks pasted on.

## Values

- At contact: scale 1.15 on x, 0.85 on y, from the bottom edge (`transform-origin: bottom center`). Back to 1 × 1.
- Recover: 200 ms, `cubic-bezier(0.32, 0.72, 0, 1)`. Run it once, after the drop move ends.
- The area stays the same (1.15 × 0.85 ≈ 1), so the item does not look like it grows.
- The video shows the effect but no numbers. The scale is a chosen value; the curve is the catalog ease-out default.

## Reference

```css
.dock-item.just-landed {
  transform-origin: bottom center;
  animation: land-squash 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes land-squash {
  from { scale: 1.15 0.85; }
  to { scale: 1 1; }
}
```

Add `just-landed` on the drop's `transitionend`, and remove it on `animationend`.

## Reduced motion

No squash. The item ends the drop at scale 1.
