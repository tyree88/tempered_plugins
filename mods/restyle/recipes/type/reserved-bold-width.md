---
name: Reserve bold width so labels do not shift
category: type
applies_to: link, button, menu, list
source: owner
added: 2026-11-18
---

## When

A tab, nav link or menu item turns bold on hover or when active, and the extra glyph width pushes its neighbours sideways.

## Values

- Copy the label into a `data-label` attribute.
- Render a hidden `::after` with the same text at the bold weight (here 600), `height: 0`, `visibility: hidden`, `overflow: hidden`.
- Stack it under the real text with `display: inline-flex; flex-direction: column`, so the box is always as wide as the bold version.
- Normal weight 400, active weight 600. No width transition.

## Reference

```css
.nav-link {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  font-weight: 400;
}
.nav-link::after {
  content: attr(data-label);
  font-weight: 600;
  height: 0;
  visibility: hidden;
  overflow: hidden;
  user-select: none;
  pointer-events: none;
}
.nav-link:hover,
.nav-link[aria-current="page"] {
  font-weight: 600;
}
```

```html
<a class="nav-link" data-label="Pricing" href="/pricing">Pricing</a>
```

## Reduced motion

Not affected.
