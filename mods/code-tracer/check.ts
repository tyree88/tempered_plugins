// Self-check for the pure logic. Run: node check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import { addsCapability, counts, isCosmetic, isTestPath, patchesFromBash, patchesFromEdit, range, relPath } from './hooks/capture.ts'
import { toMarkdown } from './hooks/export.ts'
import { agentRows, score, sessionScore } from './hooks/score.ts'
import { firstSentence, whyOf } from './hooks/why.ts'
import type { Change } from './types/index.d.ts'

const hunk = (newStart: number, lines: string[]) => ({ oldStart: newStart, oldLines: lines.filter(l => !l.startsWith('+')).length, newStart, newLines: lines.filter(l => !l.startsWith('-')).length, lines })
const change = (over: Partial<Change>): Change => ({
  v: 1, id: 'x', at: 0, session: 's', tool: 'Edit', path: 'src/a.ts', hunks: [hunk(1, ['-a', '+b'])], additions: 1, deletions: 1, isNew: false, why: 'because', whySource: 'captured', score: 0, signals: [], userModified: false, ...over,
})

// capture
assert.equal(relPath('/w/app/src/a.ts', '/w/app'), 'src/a.ts')
assert.equal(relPath('/other/a.ts', '/w/app'), '/other/a.ts')
assert.deepEqual(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [] }), [])
assert.equal(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [hunk(3, ['-x', '+y'])], gitDiff: { status: 'added' } })[0]?.isNew, true)
assert.equal(patchesFromEdit({ type: 'create', filePath: '/w/a.ts', content: 'x', structuredPatch: [hunk(1, ['+x'])], originalFile: null })[0]?.isNew, true)
assert.equal(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [hunk(1, ['-x', '+y'])], originalFile: 'x', userModified: true })[0]?.userModified, true)
assert.deepEqual(patchesFromBash({ bashEditDiff: { files: [{ filePath: '/w/b.ts', hunks: [hunk(1, ['+z'])], created: true }, { filePath: '/w/gone.ts', hunks: [hunk(1, ['-q'])], deleted: true }], moreFiles: 0 } }).map(p => p.path), ['/w/b.ts'])
assert.deepEqual(counts([hunk(1, ['-a', '+b', '+c', ' d'])]), { additions: 2, deletions: 1 })
assert.equal(isCosmetic([hunk(1, ['-  foo( a )', '+foo(a)', '-// old note', '+// new note'])]), true)
assert.equal(isCosmetic([hunk(1, ['-if (exp < now)', '+if (exp <= now)'])]), false)
assert.equal(addsCapability([hunk(1, ['+export function parse() {}'])]), true)
assert.equal(addsCapability([hunk(1, ['+  return 1'])]), false)
assert.equal(isTestPath('src/a.test.ts'), true)
assert.equal(isTestPath('tests/fixtures/a.json'), true)
assert.equal(isTestPath('src/a.ts'), false)
assert.deepEqual(range([hunk(10, ['+a', '+b']), hunk(40, ['-c'])]), { from: 10, to: 40 })

// score: a new exported function with a test beside it and 4 importers scores high; a cosmetic edit with no why scores low
const cap = change({ id: 'c1', path: 'src/parse.ts', hunks: [hunk(1, ['+export function parse() {}'])], importers: 4 })
const test = change({ id: 't1', path: 'src/parse.test.ts', hunks: [hunk(1, ['+parse()'])] })
const high = score(cap, [test])
assert.ok(high.score >= 7, `expected >= 7, got ${high.score} ${high.signals}`)
assert.ok(high.signals.includes('new capability') && high.signals.includes('tests or callers touched') && high.signals.includes('reach 4 files'))
const low = score(change({ id: 'c2', why: '', hunks: [hunk(1, ['-a ', '+a'])], importers: 0 }), [])
assert.ok(low.score <= 1, `expected <= 1, got ${low.score}`)
assert.ok(low.signals.includes('cosmetic') && low.signals.includes('no why') && low.signals.includes('no tests'))
// churn: the same hunk again by the same agent loses a point
const first = change({ id: 'c3', hunks: [hunk(5, ['-a', '+b'])], importers: 0 })
const again = change({ id: 'c4', hunks: [hunk(5, ['-b', '+c'])], importers: 0 })
assert.ok(score(again, [first]).signals.includes('churn ×1'))
assert.ok(score(again, [first]).score < score(first, []).score)
// another agent on the same lines is not churn
assert.ok(!score(change({ ...again, agentId: 'a1' }), [first]).signals.some(s => s.startsWith('churn')))
assert.equal(score(change({ importers: undefined }), []).signals.includes('reach unknown'), true)
assert.equal(sessionScore([]), null)
assert.equal(sessionScore([change({ score: 4 }), change({ score: 8 })]), 6)

// agent rows: main first, running agent shown even with no change
const rows = agentRows([change({ score: 6 }), change({ agentId: 'a1', score: 8, path: 'src/b.ts' })], [{ agentId: 'a1', type: 'test-engineer', description: 'write tests', model: 'haiku', startedAt: 0, endedAt: 1, reads: 2, edits: 1, asks: 0 }, { agentId: 'a2', type: 'reviewer', description: '', model: 'sonnet', startedAt: 0, reads: 0, edits: 0, asks: 0 }], 10)
assert.deepEqual(rows.map(r => r.id), ['a2', 'main', 'a1'])
assert.equal(rows.find(r => r.id === 'a1')?.leverage, '1 edit / 2 reads')
assert.equal(rows.find(r => r.id === 'a1')?.label, 'test-engineer · write tests')

// why
assert.equal(firstSentence('Fix the expiry check. Then add tests.'), 'Fix the expiry check.')
assert.ok(firstSentence(`${'word '.repeat(60)}end`).endsWith('…'))
const msgs = [
  { role: 'assistant' as const, text: 'Expiry used < so a token valid at :00 was refused.', toolUses: [] },
  { role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'tu1' }] },
]
assert.deepEqual(whyOf(msgs, 'tu1', 'write tests'), { why: 'Expiry used < so a token valid at :00 was refused.', whySource: 'captured' })
assert.deepEqual(whyOf([], 'tu9', 'write tests'), { why: 'write tests', whySource: 'spawn' })
assert.deepEqual(whyOf([], 'tu9', ''), { why: '', whySource: 'none' })

// export
const md = toMarkdown('app', 'main', [cap, test], [])
assert.ok(md.includes('## main') && md.includes('### src/parse.ts:1') && md.includes('```diff') && md.includes('**Why:** because'))

console.log('code-tracer check: ok')
