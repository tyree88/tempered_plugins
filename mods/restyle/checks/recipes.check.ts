import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkPatch, parseRecipe } from '../hooks/recipes.ts'

const GOOD = `---
name: Scale to 0.97 on press
category: motion
applies_to: button, toggle
source: owner
added: 2026-11-18
---

## When

A button is pressed.

## Values

Scale 0.97, 100 ms.

## Reference

\`\`\`css
button:active { transform: scale(0.97); }
\`\`\`

## Reduced motion

No scale.
`

function bad(text: string, folder = 'motion') {
  const r = parseRecipe('sample', folder, text)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.slug, 'sample')
    assert.ok(r.reason.length > 0)
    return r.reason
  }
  return ''
}

test('a good file parses', () => {
  const r = parseRecipe('scale-on-press', 'motion', GOOD)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.recipe.slug, 'scale-on-press')
  assert.equal(r.recipe.name, 'Scale to 0.97 on press')
  assert.equal(r.recipe.category, 'motion')
  assert.deepEqual(r.recipe.appliesTo, ['button', 'toggle'])
  assert.equal(r.recipe.source, 'owner')
  assert.equal(r.recipe.added, '2026-11-18')
  assert.ok(r.recipe.body.startsWith('## When'))
  assert.ok(!r.recipe.body.includes('---'))
})

for (const key of ['name', 'category', 'applies_to', 'source', 'added']) {
  test(`missing key ${key} fails`, () => {
    const text = GOOD.replace(new RegExp(`^${key}:.*\\n`, 'm'), '')
    assert.match(bad(text), new RegExp(key))
  })
}

test('a bad category fails', () => {
  assert.match(bad(GOOD.replace('category: motion', 'category: colour')), /category/)
})

test('a category that differs from the folder fails', () => {
  assert.match(bad(GOOD, 'type'), /folder/)
})

test('an unknown applies_to word fails', () => {
  assert.match(bad(GOOD.replace('button, toggle', 'button, spaceship')), /spaceship/)
})

test('a bad date fails', () => {
  assert.match(bad(GOOD.replace('2026-11-18', '2026-13-40')), /date/)
  assert.match(bad(GOOD.replace('2026-11-18', '18/11/2026')), /date/)
})

for (const heading of ['## When', '## Values', '## Reference', '## Reduced motion']) {
  test(`missing heading ${heading} fails`, () => {
    assert.match(bad(GOOD.replace(`${heading}\n`, '')), /heading/)
  })
}

test('headings out of order fail', () => {
  const swapped = GOOD.replace('## When', '## TMP').replace('## Values', '## When').replace('## TMP', '## Values')
  assert.match(bad(swapped), /heading/)
})

test('every file under recipes/ parses', () => {
  const root = join(import.meta.dirname, '..', 'recipes')
  const failures: string[] = []
  let count = 0
  for (const category of ['motion', 'type', 'visual', 'effect']) {
    const dir = join(root, category)
    if (!existsSync(dir)) continue // an absent or empty folder is fine
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue
      count++
      const r = parseRecipe(file.slice(0, -3), category, readFileSync(join(dir, file), 'utf8'))
      if (!r.ok) failures.push(`recipes/${category}/${file}: ${r.reason}`)
    }
  }
  assert.deepEqual(failures, [], `malformed recipe files:\n${failures.join('\n')}`)
  assert.ok(count >= 10, `expected at least the 10 type recipes, found ${count}`)
})

// ---------- the patch: CSS for one element, where `&` stands for the element ----------

const PATCH = `& {
  transition: scale 150ms ease-out;
}

&:active {
  scale: 0.97;
}

@media (prefers-reduced-motion: reduce) {
  & {
    transition: none;
  }
}`
const withPatch = (css: string, heading = '## Patch') => `${GOOD}\n${heading}\n\nOne line of text before the block.\n\n\`\`\`css\n${css}\n\`\`\`\n`

test('a recipe with a patch: the patch is parsed, and it is not in the body that goes into a prompt', () => {
  const r = parseRecipe('scale-on-press', 'motion', withPatch(PATCH))
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.recipe.patch, PATCH)
  assert.equal(r.recipe.body.includes('## Patch'), false)
  assert.equal(r.recipe.body.includes('&:active'), false)
  assert.ok(r.recipe.body.endsWith('No scale.'))
})

test('a recipe with no patch section has no patch', () => {
  const r = parseRecipe('scale-on-press', 'motion', GOOD)
  assert.equal(r.ok && 'patch' in r.recipe, false)
})

test('a patch section with no css block, or before the last heading, fails', () => {
  assert.match(bad(`${GOOD}\n## Patch\n\nNo block here.\n`), /no fenced css block/)
  assert.match(bad(GOOD.replace('## Reduced motion', `## Patch\n\n\`\`\`css\n& { scale: 1 }\n\`\`\`\n\n## Reduced motion`)), /after "## Reduced motion"/)
})

test('checkPatch: plain rules on the element, a media block around them, keyframes', () => {
  for (const css of [
    PATCH,
    '& { color: red }',
    '&::after, &:not(:disabled):hover, &[aria-pressed="true"], &:nth-child(2n+1) { opacity: 1 } /* a note */',
    '@keyframes restyle-in { from { opacity: 0; scale: 0.97 } 50%, 60% { opacity: 0.5 } to { opacity: 1 } }\n& { animation: restyle-in 200ms cubic-bezier(0.32, 0.72, 0, 1) }',
    '@media (prefers-color-scheme: dark) and (min-width: 600px) { & { border-color: rgb(255 255 255 / 0.12) } &:hover { opacity: 0.9 } }',
  ]) {
    assert.equal(checkPatch(css), undefined, css)
  }
})

test('checkPatch: refuses what loads something, what leaves the element, and what is not a plain rule', () => {
  const refused: [string, RegExp][] = [
    ['@import "https://x.example/a.css"; & { color: red }', /@import/],
    ['@IMPORT url(a.css); & { color: red }', /@import/],
    ['& { background: url(https://x.example/a.png) }', /url\(/],
    ['& { background: URL (a.png) }', /url\(/],
    ['& { background: image-set("https://x.example/a.png" 1x) }', /image-set\(/],
    ['& { background-image: -webkit-image-set("a.png" 1x) }', /image-set\(/],
    ['& { color: red } </style><script>alert(1)</script>', /"<"/],
    ['& { background: \\75rl(a.png) }', /backslash/],
    ['& { font-family: "x", "https://x.example" }', /"\/\/"/],
    ['& { width: expression(alert(1)) }', /script/],
    ['& span { color: red }', /not the element itself/],
    ['& > * { color: red }', /not the element itself/],
    ['& + p { color: red }', /not the element itself/],
    ['& ~ p { color: red }', /not the element itself/],
    ['body { display: none }', /not the element itself/],
    ['* { display: none }', /not the element itself/],
    [':root { --x: 1 }', /not the element itself/],
    ['&, body { color: red }', /not the element itself/],
    ['&:hover, html & { color: red }', /not the element itself/],
    ['.x& { color: red }', /not the element itself/],
    ['@font-face { font-family: x }', /@font-face/],
    ['@supports (scale: 1) { & { scale: 1 } }', /@supports/],
    ['@property --a { syntax: "<angle>"; inherits: false; initial-value: 0deg }', /"<"/],
    ['@media screen { body { display: none } }', /not the element itself/],
    ['@media screen { @media print { & { color: red } } }', /not the element itself/],
    ['@keyframes x { from { opacity: 0 } body { opacity: 1 } }', /not a keyframe step/],
    ['& { &:hover { color: red } }', /not a declaration/],
    ['& { content: "a & b" }', /not a declaration/],
    ['& { color: red', /no "}"/],
    ['& { color: red } }', /no "{"/],
    ['& { color: red } color: blue', /outside a rule/],
    ['/* nothing */', /no rule/],
    ['', /no rule/],
    [`& { color: red } /* ${'x'.repeat(4000)} */`, /over 4000/],
  ]
  for (const [css, reason] of refused) assert.match(checkPatch(css) ?? 'accepted', reason, css)
  // A recipe file with a refused patch does not parse: the pane and the board leave it out.
  assert.match(bad(withPatch('& span { color: red }')), /bad patch: the selector "& span"/)
})

test('the catalog has patches, and each one has a rule on the element', () => {
  const root = join(import.meta.dirname, '..', 'recipes')
  let patched = 0
  for (const category of ['motion', 'type', 'visual', 'effect']) {
    for (const file of readdirSync(join(root, category)).filter(f => f.endsWith('.md'))) {
      const r = parseRecipe(file.slice(0, -3), category, readFileSync(join(root, category, file), 'utf8'))
      if (!r.ok || r.recipe.patch === undefined) continue
      patched++
      assert.match(r.recipe.patch, /(^|\})\s*&[^{]*\{/, `${category}/${file}: no rule on &`)
      // A patch with motion carries its reduced-motion path.
      if (/\b(animation|transition)\s*:/.test(r.recipe.patch) && !/transition:\s*none/.test(r.recipe.patch.split('@media')[0] ?? '')) {
        assert.match(r.recipe.patch, /prefers-reduced-motion/, `${category}/${file}: motion with no reduced-motion path`)
      }
    }
  }
  assert.ok(patched >= 10, `expected at least 10 recipes with a patch, found ${patched}`)
})
