---
name: Trim the space above caps and below the baseline
category: type
applies_to: button, heading, text
source: owner
added: 2026-11-18
---

## When

Text inside a button, badge or card looks low or off-centre, because the font's line box adds empty space above the cap height and below the baseline.

## Values

- `text-box-trim: trim-both` removes the extra space on both edges.
- `text-box-edge: cap alphabetic` trims to the cap height on top and the baseline on the bottom.
- Set padding after trim: for a 40 px button with 16 px text, use `padding-block: 12px` instead of the usual 10 px plus a line-height guess.
- Support is partial (Chromium and Safari, not yet Firefox): the fallback is `line-height: 1` plus padding tuned by eye, wrapped so trim wins where it exists.

## Reference

```css
.button {
  font-size: 16px;
  line-height: 1;
  padding-block: 11px 13px; /* fallback: hand-tuned optical centre */
}
@supports (text-box-trim: trim-both) {
  .button {
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
    padding-block: 12px;
  }
}
```

## Reduced motion

Not affected.

## Patch

```css
& {
  text-box-trim: trim-both;
  text-box-edge: cap alphabetic;
}
```
