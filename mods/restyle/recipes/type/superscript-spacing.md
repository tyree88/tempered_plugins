---
name: Superscripts that keep the line height
category: type
applies_to: text, heading
source: owner
added: 2026-11-18
---

## When

A footnote mark, trademark sign or ordinal in `<sup>` pushes its line down, so one line in a paragraph has a larger gap above it than the others.

## Values

- `vertical-align: baseline` removes the default raise that grows the line box.
- `position: relative; top: -0.5em` raises the glyph visually instead, outside the layout.
- `font-size: 0.75em`; `line-height: 0` so the smaller box cannot grow the line.
- Where the font has real superscript glyphs, `font-variant-position: super` is better: no size or offset hack. Support is partial (Firefox and Safari); keep the offset rule as the fallback.

## Reference

```css
sup,
sub {
  font-size: 0.75em;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}
sup { top: -0.5em; }
sub { bottom: -0.25em; }
```

## Reduced motion

Not affected.
