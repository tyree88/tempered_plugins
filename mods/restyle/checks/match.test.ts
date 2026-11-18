import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kindsOf, parseLine, rank } from '../hooks/match.ts'
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

const recipe = (slug: string, category: 'motion' | 'type', appliesTo: Kind[], name = slug): Recipe => ({
  slug,
  name,
  category,
  appliesTo,
  source: 'owner',
  added: '2026-11-18',
  body: '## When\n\nx',
})

test('kindsOf: a button is a button that shows text, and ends with any', () => {
  assert.deepEqual(kindsOf(pickOf('button')), ['button', 'text', 'any'])
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
    recipe('trim', 'type', ['text'], 'Text trim'),
    recipe('ease', 'motion', ['any'], 'Ease out'),
    recipe('press', 'motion', ['button'], 'Press scale'),
  ]
  assert.deepEqual(
    rank(all, pickOf('button')).map(r => r.slug),
    ['press', 'trim', 'ease', 'pop'],
  )
})

test('rank: with no pick, by category then name', () => {
  const all = [recipe('b', 'type', ['text'], 'B'), recipe('z', 'motion', ['button'], 'Z'), recipe('a', 'motion', ['any'], 'A')]
  assert.deepEqual(
    rank(all, undefined).map(r => r.slug),
    ['a', 'z', 'b'],
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
