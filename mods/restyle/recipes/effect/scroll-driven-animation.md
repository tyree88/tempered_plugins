---
name: Drive an animation with scroll position
category: effect
applies_to: any, heading, image, nav, card, background, progress
source: https://www.tiktok.com/@aniakubow/video/7400027301028646176
added: 2026-11-20
---

## When

An element must change as the page scrolls: a hero that fades out, a header that shrinks, a bar that fills. A scroll listener in JavaScript runs on the main thread and can stutter. `animation-timeline: scroll()` ties a normal keyframe animation to the scroll position, so the browser runs it with no script, and scrolling back plays it in reverse.

Do not use it to hide content that people still need at that scroll position, such as the only navigation.

## Values

- Adds no markup. It binds an existing keyframe animation to a scroll timeline instead of to time.
- Keyframes: `to { opacity: 0; }`. The start state is the element's own style.
- Timeline: `animation-timeline: scroll()`, which tracks the nearest scrolling ancestor on the block axis. Use `scroll(root)` to track the page itself.
- Order matters: write `animation-timeline` after the `animation` shorthand. The shorthand resets the timeline to time.
- Duration `auto` and easing `linear`, so progress follows the scroll one to one. Fill `both`, so the end state holds past the range.
- Range: `animation-range: 0 300px`, so the fade ends after 300px of scroll (my default; not shown in the source).
- For a reveal as each element enters the viewport, use `animation-timeline: view()` instead.
- Browser support: check current support. Wrap the rules in `@supports (animation-timeline: scroll())`. Without support the element stays in its start state, fully visible.

## Reference

```css
@keyframes fade-out {
  to { opacity: 0; }
}

@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    .fade-on-scroll {
      animation: fade-out auto linear both;
      animation-timeline: scroll();
      animation-range: 0 300px;
    }
  }
}
```

```html
<header class="fade-on-scroll">…</header>
```

## Reduced motion

The media query skips the animation, so the element stays visible and still. An opacity-only fade is mild, but keyframes that move or scale the element must not run under `prefers-reduced-motion: reduce`.
