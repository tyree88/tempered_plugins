---
name: Balance the lines of a heading
category: type
applies_to: heading
source: owner
added: 2026-11-24
---

## When

A heading wraps to two or more lines, and the last line holds one or two words while the first runs the full width.

## Values

- `text-wrap: balance` on headings: the browser makes the lines about the same length.
- It applies to blocks of up to six lines in Chromium and ten in Firefox. A longer block wraps as before.
- Body text takes `text-wrap: pretty`, not `balance`: it only prevents a short last line.
- Do not add a `<br>` to force the break. The break is wrong at the next width.

## Reference

```css
h1, h2, h3 {
  text-wrap: balance;
}

p {
  text-wrap: pretty;
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  text-wrap: balance;
}
```
