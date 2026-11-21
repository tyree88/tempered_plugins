import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRecipe } from '../hooks/recipes.ts'

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
