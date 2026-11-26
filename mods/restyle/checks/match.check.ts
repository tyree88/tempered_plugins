import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kindsOf, parseLine, rank, shelf } from '../hooks/match.ts'
import type { Kind, Pick, Recipe } from '../types/index.d.ts'

const pickOf = (tag: string, extra: Partial<Pick> = {}): Pick => ({
  url: 'http://localhost:3000/',
  tag,
  selector: `#${tag}`,
  text: 'Save',
  size: { width: 80, height: 32 },
  styles: {},
  ...extra,
})

const recipe = (slug: string, category: Recipe['category'], appliesTo: Kind[], name = slug): Recipe => ({
  slug,
  name,
  category,
  appliesTo,
  source: 'owner',
  added: '2026-11-18',
  body: '## When\n\nx',
})

test('kindsOf: a button with a label is a button, not text; text is an element that shows text and has no role', () => {
  assert.deepEqual(kindsOf(pickOf('button')), ['button', 'any'])
  assert.deepEqual(kindsOf(pickOf('a')), ['link', 'any'])
  assert.deepEqual(kindsOf(pickOf('p')), ['text', 'any'])
  assert.deepEqual(kindsOf(pickOf('h2')), ['heading', 'any'])
})

test('shelf: by the role of the element. Recipes for running text stay off a button; the fix of the finding leads', () => {
  const patched = (r: Recipe): Recipe => ({ ...r, patch: '& { scale: 0.97 }' })
  const recipes = [
    patched(recipe('hyphens', 'type', ['text'])),
    patched(recipe('small-caps', 'type', ['text'])),
    patched(recipe('trim', 'type', ['button', 'heading', 'text'])),
    patched(recipe('press', 'motion', ['button', 'toggle'])),
    patched(recipe('balance', 'type', ['heading'])),
    patched(recipe('corners', 'visual', ['card'])),
  ]
  const slugs = (pick: Pick, fixId?: string) => shelf(recipes, pick, fixId).fit.map(r => r.slug)
  assert.deepEqual(slugs(pickOf('button')), ['press', 'trim'])
  assert.deepEqual(slugs(pickOf('p')), ['hyphens', 'small-caps', 'trim'])
  assert.deepEqual(slugs(pickOf('h2')), ['balance', 'trim'])
  // The recipe that fixes the finding comes first, and also when it names another kind (a radius fix on a section).
  assert.deepEqual(slugs(pickOf('h2'), 'type/trim'), ['trim', 'balance'])
  assert.deepEqual(slugs(pickOf('section', { text: '' }), 'visual/corners'), ['corners'])
})

test('kindsOf: role adds kinds; no text, no text kind', () => {
  assert.deepEqual(kindsOf(pickOf('div', { role: 'switch', text: '  ' })), ['toggle', 'any'])
  assert.deepEqual(kindsOf(pickOf('div', { text: '' })), ['any'])
})

test('rank: a <button> pick ranks a button recipe above an any recipe', () => {
  const all = [recipe('anything', 'motion', ['any'], 'A any'), recipe('press', 'motion', ['button'], 'Z press')]
  assert.deepEqual(
    rank(all, pickOf('button')).map(r => r.slug),
    ['press', 'anything'],
  )
})

test('rank: matches first, then category, then name; a non-match goes last', () => {
  const all = [
    recipe('pop', 'motion', ['popover'], 'Popover start'),
    recipe('trim', 'type', ['button', 'text'], 'Text trim'),
    recipe('ease', 'motion', ['any'], 'Ease out'),
    recipe('press', 'motion', ['button'], 'Press scale'),
    recipe('caps', 'type', ['text'], 'Small caps'), // for running text: a button's label does not make it a match
  ]
  assert.deepEqual(
    rank(all, pickOf('button')).map(r => r.slug),
    ['press', 'trim', 'ease', 'pop', 'caps'],
  )
})

test('rank: with no pick, by category then name', () => {
  const all = [recipe('b', 'type', ['text'], 'B'), recipe('z', 'motion', ['button'], 'Z'), recipe('a', 'motion', ['any'], 'A')]
  assert.deepEqual(
    rank(all, undefined).map(r => r.slug),
    ['a', 'z', 'b'],
  )
})

test('rank: effects come after the single-element categories', () => {
  const all = [recipe('glow', 'effect', ['any'], 'A glow'), recipe('edge', 'visual', ['any'], 'Z edge'), recipe('ease', 'motion', ['any'], 'M ease')]
  assert.deepEqual(
    rank(all, pickOf('div')).map(r => r.slug),
    ['ease', 'edge', 'glow'],
  )
})

test('parseLine: ready, hello, and a pick with its fields checked', () => {
  assert.deepEqual(parseLine('{"type":"ready","port":5123,"token":"ab"}'), { type: 'ready', port: 5123, token: 'ab' })
  assert.deepEqual(parseLine('{"type":"hello","url":"http://localhost/"}'), { type: 'hello', url: 'http://localhost/' })
  const line = parseLine(JSON.stringify({ type: 'pick', pick: { tag: 'a', selector: '#x', text: 'y'.repeat(300), styles: { color: 'red', bad: 1 }, source: { file: 'a.tsx', line: '3' }, extra: 1 } }))
  assert.equal(line?.type, 'pick')
  if (line?.type !== 'pick') return
  assert.equal(line.pick.text.length, 200)
  assert.deepEqual(line.pick.styles, { color: 'red' })
  assert.equal(line.pick.source, undefined)
  assert.equal('extra' in line.pick, false)
  assert.deepEqual(line.pick.size, { width: 0, height: 0 })
})

test('parseLine: not JSON, a pick without selector, an unknown type: nothing', () => {
  assert.equal(parseLine('{"type":"pi'), undefined)
  assert.equal(parseLine('{"type":"pick","pick":{"tag":"a"}}'), undefined)
  assert.equal(parseLine('{"type":"other"}'), undefined)
  assert.equal(parseLine('null'), undefined)
})

test('shelf: the recipes with a patch that fit the element, own kind first; those with no patch apart', () => {
  const patched = (r: Recipe): Recipe => ({ ...r, patch: '& { scale: 0.97 }' })
  const recipes = [
    patched(recipe('underline', 'type', ['link'])),
    patched(recipe('border', 'visual', ['any'])),
    patched(recipe('press', 'motion', ['button'])),
    patched(recipe('entrance', 'motion', ['any'])),
    recipe('shake', 'motion', ['button', 'input']), // fits a button, but has no patch: it needs a state
    recipe('grain', 'effect', ['any']), // no patch, and not of the element's own kind
  ]
  const button = shelf(recipes, pickOf('button'))
  assert.deepEqual(button.fit.map(r => r.slug), ['press', 'entrance', 'border'])
  assert.deepEqual(button.more.map(r => r.slug), ['shake'])
  // A recipe that does not fit is on no list.
  assert.equal([...button.fit, ...button.more].some(r => r.slug === 'underline'), false)
  const link = shelf(recipes, pickOf('a'))
  assert.deepEqual(link.fit.map(r => r.slug), ['underline', 'entrance', 'border'])
  assert.deepEqual(link.more, [])
})

test('shelf: 12 with a patch and 6 with none, at most', () => {
  const many = Array.from({ length: 20 }, (_, i) => recipe(`r${i}`, 'motion', ['button']))
  const out = shelf([...many.map(r => ({ ...r, patch: '& { opacity: 1 }' })), ...many.map(r => ({ ...r, slug: `n-${r.slug}` }))], pickOf('button'))
  assert.equal(out.fit.length, 12)
  assert.equal(out.more.length, 6)
})
