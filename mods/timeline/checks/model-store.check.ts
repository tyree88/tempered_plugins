import assert from 'node:assert/strict'
import { fnv1a, folderName, mergeEntries, parseJsonl, repoRoot, toJsonl, tzMinutes } from '../hooks/model.ts'

assert.equal(fnv1a(''), '811c9dc5')
assert.equal(fnv1a('a'), 'e40c292c')
assert.match(folderName('/Users/me/code/app'), /^app-[0-9a-f]{8}$/)
assert.notEqual(folderName('/a/api'), folderName('/b/api'))
assert.equal(repoRoot('/T/work/app/.git'), '/T/work/app')
assert.equal(repoRoot('/T/work/app/.git/'), '/T/work/app')
assert.equal(repoRoot('/srv/bare.git'), '/srv/bare.git')

const a = { v: 1, id: 's1-1', at: '2026-10-04T20:00:00.000Z', session: 's1', kind: 'talk', title: 'one' }
const b = { v: 1, id: 's2-1', at: '2026-10-04T19:00:00.000Z', session: 's2', kind: 'talk', title: 'two' }
assert.deepEqual(parseJsonl(`${JSON.stringify(a)}\n{broken\n\n${JSON.stringify({ v: 2, id: 'x' })}\n`), { entries: [a], bad: 2 })
assert.equal(toJsonl([a, b]), `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`)
assert.deepEqual(mergeEntries([[a], [b, a]]).map(e => e.id), ['s2-1', 's1-1'])

assert.equal(tzMinutes('-0500'), -300)
assert.equal(tzMinutes('+0530\n'), 330)
assert.equal(tzMinutes(undefined), 0)

const variant = (o: object) => JSON.stringify({ v: 1, id: 'x', at: 'a', session: 's', kind: 'talk', title: 't', ...o })
assert.equal(parseJsonl([variant({ title: 5 }), variant({ kind: 'note' }), variant({ session: 3 })].join('\n')).bad, 3)
assert.deepEqual(parseJsonl(`${JSON.stringify(a)}\r\n${JSON.stringify(b)}\r\n`).entries.map(e => e.id), ['s1-1', 's2-1'])
assert.deepEqual(mergeEntries([[{ ...a, id: 's1-10' }, { ...a, id: 's1-9' }]]).map(e => e.id), ['s1-9', 's1-10'])
assert.equal(mergeEntries([[a, { ...a, title: 'newer' }]])[0]?.title, 'newer')
assert.match(folderName('/'), /^root-[0-9a-f]{8}$/)
assert.equal(folderName('/tmp/x/'), folderName('/tmp/x'))
assert.equal(tzMinutes('+5'), 0)
console.log('model-store: ok')
