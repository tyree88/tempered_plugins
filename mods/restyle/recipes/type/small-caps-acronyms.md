---
name: Small caps for acronyms in running text
category: type
applies_to: text
source: owner
added: 2026-11-18
---

## When

Acronyms such as API, CSS or HTTP in a paragraph look loud next to lower-case text, because full capitals are taller and darker than the words around them.

## Values

- `font-variant-caps: all-small-caps` draws every letter as a small capital, close to the x-height.
- `letter-spacing: 0.05em` opens the tight small-cap spacing.
- `font-variant-numeric: oldstyle-nums` if the acronym holds digits, so they match the small caps.
- Wrap each acronym in `<abbr>` with a `title` the first time it appears.
- If the font has no real small caps, the browser fakes them by shrinking capitals, which look thin. Check the font; if fake, keep normal capitals at `font-size: 0.9em` and the same letter-spacing.

## Reference

```css
abbr {
  font-variant-caps: all-small-caps;
  letter-spacing: 0.05em;
  font-variant-numeric: oldstyle-nums;
  text-decoration: none;
}
```

```html
<p>Send the request to the <abbr title="application programming interface">API</abbr>.</p>
```

## Reduced motion

Not affected.

## Patch

```css
& {
  font-variant-caps: all-small-caps;
  letter-spacing: 0.05em;
  font-variant-numeric: oldstyle-nums;
  text-decoration: none;
}
```
