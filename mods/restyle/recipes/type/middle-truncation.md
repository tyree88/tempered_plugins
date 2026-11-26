---
name: Truncate in the middle to keep the end
category: type
applies_to: text, list
source: owner
added: 2026-11-18
---

## When

A long file name, path or ID is cut with an ellipsis at the end, which hides the part that tells items apart, such as the extension or the last digits.

## Values

- Split the string into a head and a tail; the tail is the last 8 characters (for a file name, at least the extension).
- The head shrinks and gets `text-overflow: ellipsis`; the tail never shrinks (`flex-shrink: 0`).
- Put the full string in `title`. Head and tail together hold the whole string and the ellipsis is drawn by CSS only, so a screen reader still reads it in full. Keep no whitespace between the two spans.
- CSS has no native middle ellipsis; this two-span split is the fallback that works in every browser.

## Reference

```css
.middle-truncate {
  display: flex;
  min-width: 0;
  white-space: nowrap;
}
.middle-truncate .head {
  overflow: hidden;
  text-overflow: ellipsis;
}
.middle-truncate .tail {
  flex-shrink: 0;
}
```

```html
<span class="middle-truncate" title="quarterly-report-final-v3.pdf"><span class="head">quarterly-report-fin</span><span class="tail">al-v3.pdf</span></span>
```

## Reduced motion

Not affected.
