---
name: Typographic quotes and apostrophes
category: type
applies_to: text, heading
source: owner
added: 2026-11-18
---

## When

Copy uses straight marks (" and ') where real quotation marks and apostrophes belong, which looks like code rather than prose.

## Values

- Apostrophe: ’ (U+2019), as in don’t and it’s.
- English double quotes: “ (U+201C) and ” (U+201D); single: ‘ (U+2018) and ’ (U+2019).
- Inline quotes: use `<q>` and let CSS `quotes` supply the marks, so the text holds no quote characters and the language decides the style.
- German: „ “ and ‚ ‘. French: « » with a no-break space inside.
- Keep straight marks inside `code`, `pre` and inputs.

## Reference

```css
:root { quotes: "\201C" "\201D" "\2018" "\2019"; }
:lang(de) { quotes: "\201E" "\201C" "\201A" "\2018"; }
:lang(fr) { quotes: "\00AB\00A0" "\00A0\00BB" "\2039\00A0" "\00A0\203A"; }
q::before { content: open-quote; }
q::after { content: close-quote; }
```

```html
<p>She said <q>it’s done</q> and left.</p>
```

## Reduced motion

Not affected.
