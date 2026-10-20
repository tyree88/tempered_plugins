import assert from 'node:assert/strict'
import { clip, fromLog, slug } from '../hooks/model.ts'

const stamp = { id: 's1-1', at: '2026-10-04T20:00:00.000Z', session: 's1' }

assert.equal(clip('  a \n b  ', 10), 'a b')
assert.equal(clip('abcdefghij', 5), 'abcd…')
assert.equal(clip(42, 5), undefined)
assert.equal(clip('   ', 5), undefined)
assert.equal(slug('Court Lobby UI!'), 'court-lobby-ui')
assert.equal(slug('***'), 'task')

assert.deepEqual(fromLog({ kind: 'talk', title: 'build the court lobby next' }, stamp), {
  v: 1, id: 's1-1', at: stamp.at, session: 's1', kind: 'talk', title: 'build the court lobby next',
})

assert.deepEqual(
  fromLog({ kind: 'work', title: 'Court lobby UI', done: 5, total: 3, how: 'two subagents', next: 'wire route' }, stamp),
  {
    v: 1, id: 's1-1', at: stamp.at, session: 's1', kind: 'work', title: 'Court lobby UI',
    task: 'court-lobby-ui', status: 'active', total: 3, done: 3, how: 'two subagents', next: 'wire route',
  },
)

assert.deepEqual(fromLog({ kind: 'work', title: 'x', task: 'Lobby Route', status: 'blocked', done: 2 }, stamp), {
  v: 1, id: 's1-1', at: stamp.at, session: 's1', kind: 'work', title: 'x', task: 'lobby-route', status: 'blocked',
})

assert.equal((fromLog({ kind: 'work', title: 'x', total: 4, done: -2 }, stamp) as { done: number }).done, 0)
assert.ok('error' in fromLog({ kind: 'work' }, stamp))
assert.ok('error' in fromLog({ kind: 'note', title: 'x' }, stamp))
assert.equal(clip(`${'x'.repeat(78)}😀 tail`, 80), `${'x'.repeat(78)}…`)
assert.equal(slug(`${'a'.repeat(39)} b`), 'a'.repeat(39))
assert.equal(slug('ロビーを作る'), 'ロビーを作る')
assert.deepEqual(fromLog({ kind: 'work', title: 'x', total: 0, done: 1 }, stamp), {
  v: 1, id: 's1-1', at: stamp.at, session: 's1', kind: 'work', title: 'x', task: 'x', status: 'active',
})
assert.equal('total' in (fromLog({ kind: 'work', title: 'x', total: Infinity }, stamp) as object), false)
assert.equal((fromLog({ kind: 'work', title: 'x' }, { ...stamp, agentId: 'ag1' }) as { agentId?: string }).agentId, 'ag1')
assert.equal((fromLog({ kind: 'talk', title: 'y'.repeat(90) }, stamp) as { title: string }).title, `${'y'.repeat(79)}…`)
console.log('model-entries: ok')
