---
name: Glide a pill with anchor positioning
category: effect
applies_to: nav, link, list
source: https://www.tiktok.com/@aniakubow/video/7689123896787848481
added: 2026-11-20
---

## When

A row of nav links or tabs shows one soft pill behind the link under the pointer or keyboard focus, and the pill glides from link to link. Without anchor positioning this needs JavaScript that measures each link with `getBoundingClientRect()` and moves the pill. With CSS anchor positioning, one pseudo-element follows whichever link holds the anchor name, and a transition on `inset` turns each jump into a glide. No JavaScript.

## Values

- The hovered or focused link gets `anchor-name: --pill`. Only one element may hold the name; if two do, the last one in the DOM wins.
- The pill is `nav::before`: `position: absolute`, `position-anchor: --pill`, `inset: anchor(top) anchor(right) anchor(bottom) anchor(left)`, `z-index: -1`, `border-radius: 999px`.
- Glide: `transition: inset 400ms`. The video shows 400 ms with the default `ease`. Use the catalog curve `cubic-bezier(0.23, 1, 0.32, 1)` if the nav already uses it.
- Rest state: give the current page link (`aria-current="page"`) the anchor name when nothing is hovered or focused, so the pill always has a box. With no anchor, `anchor()` is invalid and the pill has no size; the first hover then snaps instead of gliding.
- The nav needs `position: relative` and `isolation: isolate`, so `z-index: -1` puts the pill behind the links but in front of the nav background.
- Support: Chrome and Edge 125+, Safari 26+, Firefox 147+ (all engines since January 2026). Fallback: inside `@supports not (anchor-name: --a)`, hide the pill and give the link itself the pill background on hover and focus. The fallback does not glide.

## Reference

```css
nav {
  position: relative;
  isolation: isolate;
}

nav::before {
  content: "";
  position: absolute;
  z-index: -1;
  position-anchor: --pill;
  inset: anchor(top) anchor(right) anchor(bottom) anchor(left);
  border-radius: 999px;
  background: color-mix(in oklch, currentColor 12%, transparent);
  transition: inset 400ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* Rest on the current page; move to the hovered or focused link. */
nav:not(:has(a:is(:hover, :focus-visible))) a[aria-current="page"],
nav a:is(:hover, :focus-visible) {
  anchor-name: --pill;
}

@supports not (anchor-name: --a) {
  nav::before {
    display: none;
  }
  nav a {
    border-radius: 999px;
  }
  nav a:is(:hover, :focus-visible, [aria-current="page"]) {
    background: color-mix(in oklch, currentColor 12%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  nav::before {
    transition: none;
  }
}
```

## Reduced motion

Remove the transition. The pill still moves to the hovered or focused link, but it appears there at once and does not glide.
