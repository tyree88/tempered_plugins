// Self-check for the pure logic. Run: node check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import { counts, declarations, isCodePath, isCosmetic, isTestPath, normalizePath, patchesFromBash, patchesFromEdit, signatureChanges, spansOf } from './hooks/capture.ts'
import { ellipsize } from './hooks/ellipsis.ts'
import { toMarkdown } from './hooks/export.ts'
import { importersOf, reachQuery } from './hooks/reach.ts'
import { bashTarget, detectRun, isReadCommand, revertedPaths, summaryOutcome } from './hooks/runs.ts'
import { howOf, nextOf } from './hooks/explain.ts'
import { attachRun, evidenceOf, fileRows, namesFile, rescore } from './hooks/score.ts'
import { rebasePath, type Placed } from './hooks/spans.ts'
import { colorFor, tagsFor } from './hooks/tags.ts'
import { firstSentence, whyOf } from './hooks/why.ts'
import type { Agent, Change } from './types/index.d.ts'

const hunk = (newStart: number, lines: string[]) => ({ oldStart: newStart, oldLines: lines.filter(l => !l.startsWith('+')).length, newStart, newLines: lines.filter(l => !l.startsWith('-')).length, lines })
const replace = (at: number, n: number) => hunk(at, [...Array.from({ length: n }, (_, i) => `-old${i}`), ...Array.from({ length: n }, (_, i) => `+new${i}`)])
const insert = (at: number, n: number) => hunk(at, Array.from({ length: n }, (_, i) => `+ins${i}`))
const remove = (at: number, n: number) => hunk(at, Array.from({ length: n }, (_, i) => `-gone${i}`))
let seq = 0
const change = (over: Partial<Change>): Change => {
  const hunks = over.hunks ?? [hunk(1, ['-a', '+b'])]
  return { v: 1, id: `c${++seq}`, at: seq, session: 's', tool: 'Edit', path: 'src/a.ts', hunks, spans: spansOf(hunks), ...counts(hunks), isNew: false, why: 'because', whySource: 'captured', signals: [], userModified: false, importerPaths: [], ...over }
}
const labels = (c: Change) => c.signals.map(s => s.label)
const has = (c: Change, re: RegExp) => labels(c).some(l => re.test(l))

// capture
assert.equal(normalizePath('/w/app/src/a.ts', '/w/app', '/w/app'), 'src/a.ts')
assert.equal(normalizePath('./src/../src/a.ts', '/w/app', '/w/app'), 'src/a.ts')
assert.equal(normalizePath('/other/a.ts', '/w/app', '/w/app'), '/other/a.ts')
assert.deepEqual(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [] }), [])
assert.equal(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [], gitDiff: { additions: 900, deletions: 2 } })[0]?.isTooLarge, true)
assert.equal(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [hunk(3, ['-x', '+y'])], gitDiff: { status: 'added' } })[0]?.isNew, true)
assert.equal(patchesFromEdit({ type: 'create', filePath: '/w/a.ts', content: 'x', structuredPatch: [hunk(1, ['+x'])], originalFile: null })[0]?.isNew, true)
assert.equal(patchesFromEdit({ filePath: '/w/a.ts', structuredPatch: [hunk(1, ['-x', '+y'])], originalFile: 'x', userModified: true })[0]?.userModified, true)
const bash = patchesFromBash({ bashEditDiff: { files: [{ filePath: '/w/b.ts', hunks: [hunk(1, ['+z'])], created: true }, { filePath: '/w/gone.ts', hunks: [], deleted: true }], moreFiles: 0 } })
assert.deepEqual(bash.map(p => [p.path, p.isDeleted ?? false]), [['/w/b.ts', false], ['/w/gone.ts', true]])
assert.deepEqual(counts([hunk(1, ['-a', '+b', '+c', ' d'])]), { additions: 2, deletions: 1 })
assert.deepEqual(spansOf([hunk(40, [' ctx', ' ctx', '-a', '+b', '+c', ' ctx'])]), [{ from: 42, to: 43 }]) // trimmed to changed lines
assert.deepEqual(spansOf([remove(45, 10)]), [{ from: 45, to: 45 }])
assert.equal(isCosmetic([hunk(1, ['-  foo( a )', '+foo(a)', '-// old note', '+// new note'])], 'a.ts'), true)
assert.equal(isCosmetic([hunk(1, ['-x = 1  # old', '+x = 1  # new'])], 'a.py'), true)
assert.equal(isCosmetic([hunk(1, ['-x = 1  # old', '+x = 1  # new'])], 'a.ts'), false) // `#` is not a comment in TS
assert.equal(isCosmetic([hunk(1, ['-if (exp < now)', '+if (exp <= now)'])], 'a.ts'), false)
assert.equal(isTestPath('src/a.test.ts'), true)
assert.equal(isTestPath('tests/fixtures/a.json'), true)
assert.equal(isTestPath('src/a.ts'), false)
assert.equal(isCodePath('src/a.ts') && !isCodePath('README.md') && !isCodePath('package.json') && !isCodePath('src/a.spec.ts'), true)

// adds export: the five declaration forms give the right name
const decl = (line: string, path = 'src/x.ts') => declarations([hunk(1, [line])], path)
assert.deepEqual(decl('+export default async function createToken(a) {'), ['createToken'])
assert.deepEqual(decl('+export const parse = async (s: string) => {'), ['parse'])
assert.deepEqual(decl('+def load_rules(path):', 'rules.py'), ['load_rules'])
assert.deepEqual(decl('+pub fn verify(token: &str) -> bool {', 'lib.rs'), ['verify'])
assert.deepEqual(decl('+func (s *Server) Handle(w http.ResponseWriter) {', 'server.go'), ['Handle'])
assert.deepEqual(decl("+router.post('/api/token', handler)"), ['/api/token'])
assert.deepEqual(declarations([hunk(1, ['+  $.tool.register({', "+    name: 'mcp__focus-group__record',"])], 'hooks/register.tsx'), ['mcp__focus-group__record'])
// the five false positives give none
assert.deepEqual(decl('+  function inner() {'), []) // nested
assert.deepEqual(decl('+  return fn(x)'), [])
assert.deepEqual(decl('+// export function old() {}'), [])
assert.deepEqual(decl('+export function parse() {}', 'src/parse.test.ts'), []) // test path
assert.deepEqual(decl('+export function parse() {}', 'docs/api.md'), []) // markdown
assert.deepEqual(signatureChanges([hunk(1, ['-export function createToken(a) {', '+export function createToken(a, b) {'])]), ['createToken'])
assert.deepEqual(signatureChanges([hunk(1, ['-const f = (a) => a', '+const f = (a, b) => a + b'])]), ['f'])
assert.deepEqual(signatureChanges([hunk(1, ['-  if (a)', '+  if (b)'])]), [])

// spans: the three-step VF-5 counterexample and its mirror, cases A, B, D, a deletion over a span, churn
const placed = (changeId: string, agent: string, order: number, h: ReturnType<typeof hunk>): Placed => ({ changeId, agent, order, newStart: h.newStart, oldLines: h.oldLines, newLines: h.newLines, span: spansOf([h])[0]! })
const only = (r: ReturnType<typeof rebasePath>) => r.overlaps.map(o => `${o.span.from}-${o.span.to}`)
assert.deepEqual(only(rebasePath([placed('a1', 'a', 1, replace(40, 9)), placed('b1', 'b', 2, insert(20, 10)), placed('b2', 'b', 3, replace(50, 9))])), ['50-58'])
assert.deepEqual(only(rebasePath([placed('a1', 'a', 1, replace(50, 9)), placed('b1', 'b', 2, insert(20, 10)), placed('b2', 'b', 3, replace(50, 9))])), [])
assert.deepEqual(only(rebasePath([placed('a1', 'a', 1, replace(50, 4)), placed('b1', 'b', 2, insert(20, 10)), placed('b2', 'b', 3, insert(30, 10)), placed('b3', 'b', 4, replace(70, 4))])), ['70-73']) // A
assert.deepEqual(only(rebasePath([placed('a1', 'a', 1, replace(45, 6)), placed('b1', 'b', 2, replace(45, 6)), placed('c1', 'c', 3, insert(20, 10))])), ['55-60']) // B
assert.deepEqual(only(rebasePath([placed('a1', 'a', 1, replace(10, 2)), placed('a1', 'a', 2, replace(400, 2)), placed('b1', 'b', 3, replace(200, 2))])), []) // D
assert.deepEqual(rebasePath([placed('a1', 'a', 1, replace(50, 9)), placed('b1', 'b', 2, remove(45, 10))]).spans.get('a1'), [{ from: 45, to: 48 }]) // VF-30
const churned = rebasePath([placed('a1', 'a', 1, replace(5, 2)), placed('a2', 'a', 2, replace(5, 2))])
assert.equal(churned.churn.get('a2'), 1)
assert.equal(churned.churn.get('a1'), undefined)

// runs: fifteen commands, eight real runners
const real = ['pnpm test', 'npx vitest run src', 'npm t', 'cd mods && claude plugin test mods/x', 'python -m pytest tests/', 'cargo test', 'go test ./...', 'CI=1 yarn test:unit']
const fake = ['git log --oneline', 'echo "vitest"', 'ls tests', 'grep -r "jest" src', 'npm install', 'cat jest.config.ts', 'node check.ts']
const ok = { isError: false, output: '' }
for (const c of real) assert.ok(detectRun(c, ok)?.kind === 'test', c)
for (const c of fake) assert.equal(detectRun(c, ok), undefined, c)
assert.deepEqual(detectRun('pnpm test', ok), { kind: 'test', runner: 'pnpm test', ok: true })
assert.deepEqual(detectRun('npx vitest run && echo done', { isError: true, output: '' }), { kind: 'test', runner: 'vitest', ok: false }) // && chain stays direct
assert.equal(detectRun('npx vitest run | tail -3', { isError: false, output: 'Tests  2 failed | 10 passed' })?.ok, false)
assert.equal(detectRun('npx vitest run | tail -3', { isError: false, output: 'Tests  12 passed (12)' })?.ok, true)
assert.equal(detectRun('npx vitest run | tail -3', { isError: false, output: 'nothing useful' })?.ok, null)
assert.equal(detectRun('pytest; echo x', { isError: false, output: '3 failed, 1 passed' })?.ok, false)
assert.equal(detectRun('go test ./... || true', { isError: false, output: 'ok  pkg 0.1s' })?.ok, true)
assert.deepEqual(detectRun('tsc -p tsconfig.json', ok), { kind: 'check', runner: 'tsc', ok: true })
assert.deepEqual(detectRun('claude plugin validate mods/x', ok), { kind: 'check', runner: 'claude plugi', ok: true })
assert.equal(detectRun('vitest', { isError: true, interrupted: true, output: '' }), undefined)
assert.equal(isReadCommand('cd /repo && rg tokenExpiry src'), true)
assert.equal(isReadCommand('ls -la'), true)
assert.equal(isReadCommand('cd mods/x && wc -l hooks/*.ts && cat check.ts'), true)
assert.equal(isReadCommand('git -C /repo log --oneline -5'), false) // shortcut: `git -C <dir> <verb>` is not parsed; upgrade when it misreads often
assert.equal(isReadCommand('git status --short && git log --oneline -3'), true)
assert.equal(isReadCommand('git checkout -- src/a.ts'), false)
assert.equal(isReadCommand('pnpm test'), false)
assert.deepEqual(revertedPaths('git checkout -- src/auth/token.ts src/b.ts'), ['src/auth/token.ts', 'src/b.ts'])
assert.deepEqual(revertedPaths('git restore src/a.ts && pnpm test'), ['src/a.ts'])
assert.equal(bashTarget('cd /very/long/path/to/repo && pnpm test --filter x --reporter dot'), 'pnpm test --filter x --r')

// reach: import patterns per extension against the eleven sample lines
const re = (path: string) => new RegExp(reachQuery(path)!.regex)
const ts = re('src/auth/token.ts')
for (const l of ["import { sign } from './token'", "from '../auth/token.ts'", 'require("./token")', "import x from '@app/auth/token.js'"]) assert.ok(ts.test(l), l)
for (const l of ["from './tokenizer'", 'const token = 1', "from './token-store'"]) assert.ok(!ts.test(l), l)
const py = re('pkg/token.py')
for (const l of ['from auth.token import sign', 'import token']) assert.ok(py.test(l), l)
for (const l of ['import tokenize', 'x = token.sign()']) assert.ok(!py.test(l), l)
assert.ok(re('src/token.rs').test('use crate::token::Sign;') && !re('src/token.rs').test('use crate::tokens;'))
assert.equal(reachQuery('src/types/index.ts'), undefined) // stop-listed directory → reach unknown
assert.ok(re('src/auth/index.ts').test("from '../auth'"))
assert.equal(reachQuery('README.md'), undefined)
assert.equal(reachQuery('pkg/server/handler.go')?.kind, 'go')
assert.deepEqual(importersOf(['src/a.ts', 'src/a.test.ts', 'src/b.ts', 'src/b.ts'], 'src/a.ts'), ['src/b.ts'])
assert.equal(importersOf(Array.from({ length: 14 }, (_, i) => `src/u${i}.ts`), 'x').length, 10)

// tags and ellipsis
assert.deepEqual(tagsFor(['test-engineer'], 12), ['test-enginee'])
assert.deepEqual(tagsFor(['test-engineer', 'test-engineer'], 12), ['test-enginee', 'test-engin#2'])
const four = tagsFor(['agent-protocols:code-reviewer', 'agent-protocols:test-engineer', 'general-purpose', 'general-purpose'], 12)
assert.equal(new Set(four).size, 4)
assert.ok(four.every(t => t.length === 12), four.join())
assert.equal(ellipsize('app/dashboard/settings/page.tsx', 30), 'app/…/settings/page.tsx')
assert.equal(ellipsize('app/dashboard/settings/page.tsx', 20), '…/settings/page.tsx')
assert.equal(ellipsize('app/dashboard/settings/page.tsx', 14), '…/s…/page.tsx')
assert.equal(ellipsize('app/components/NotificationPreferences.tsx', 24), '…/NotificationPrefe….tsx')

// completeness and rescoring over the whole session
const cfg = change({ path: 'tsconfig.json', hunks: [hunk(1, ['+"strict": true'])] })
const unrelated = change({ path: 'src/a.ts' })
assert.ok(!has(rescore([cfg, unrelated])[1]!, /touched/)) // config edit then unrelated edit
const impl = change({ path: 'src/parse.ts', hunks: [hunk(1, ['+export function parse(s: string) {', '+  return s', '+}'])], importerPaths: ['src/u1.ts', 'src/u2.ts', 'src/u3.ts'] })
const test = change({ path: 'src/parse.test.ts', hunks: [hunk(1, ['+parse("x")'])] })
const [implScored] = rescore([impl, test])
assert.ok(has(implScored!, /^test touched src\/parse\.test\.ts$/), labels(implScored!).join())
assert.ok(has(implScored!, /^adds export parse$/) && has(implScored!, /^imported by 3$/) && !has(implScored!, /no tests/))
assert.ok((implScored!.points ?? 0) >= 5, `points ${implScored!.points}`)
const idx = change({ path: 'src/auth/index.ts', hunks: [hunk(1, ['+export * from "./token"'])] })
assert.equal(namesFile(change({ path: 'src/auth/token.test.ts', hunks: [hunk(1, ['+arr.indexOf(x)'])] }), idx), true) // segment `auth` matches by path
assert.equal(namesFile(change({ path: 'src/other/x.test.ts', hunks: [hunk(1, ['+arr.indexOf(x)'])] }), idx), false)
assert.equal(namesFile(change({ path: 'src/other/x.test.ts', hunks: [hunk(1, ["+import { a } from '../auth'"])] }), idx), true)
assert.equal(namesFile(change({ path: 'src/b.ts', hunks: [hunk(1, ['+parse(x)'])] }), impl), true)
// reverted: a later change that puts the lines back; a pure add then a pure delete is not a revert
const fwd = change({ path: 'src/r.ts', hunks: [hunk(3, ['-if (a < b)', '+if (a <= b)'])] })
const back = change({ path: 'src/r.ts', hunks: [hunk(3, ['-if (a <= b)', '+if (a < b)'])] })
assert.ok(has(rescore([fwd, back])[0]!, /^reverted$/))
assert.ok(!has(rescore([change({ path: 'src/p.ts', hunks: [hunk(1, ['+x'])] }), change({ path: 'src/p.ts', hunks: [hunk(1, ['-x'])] })])[0]!, /reverted/))
// churn and cosmetic
const [, again] = rescore([change({ hunks: [hunk(5, ['-a', '+b'])] }), change({ hunks: [hunk(5, ['-b', '+c'])] })])
assert.ok(has(again!, /^churn ×1$/) && again!.signals[0]!.pts === -1)
const cos = rescore([change({ whySource: 'none', why: '', hunks: [hunk(1, ['-a ', '+a'])] })])[0]!
assert.ok(has(cos, /^cosmetic$/) && !has(cos, /^why$/) && has(cos, /^no tests$/) && cos.points === 0, labels(cos).join())
assert.ok(!has(rescore([change({ whySource: 'spawn' })])[0]!, /^why$/)) // a task description earns nothing
const tt = rescore([change({ path: 'src/token.test.ts' })])[0]!
assert.ok(!has(tt, /no tests/) && !has(tt, /test touched/))
assert.ok(has(rescore([change({ importerPaths: undefined })])[0]!, /^reach unknown$/))
assert.ok(has(rescore([change({ userModified: true })])[0]!, /^edited by you$/))
const gone = rescore([change({ isDeleted: true, hunks: [], points: 3 })])[0]!
assert.equal(gone.points, undefined)
assert.deepEqual(gone.signals, [])

// runs attach to code changes, not to README; ✗ then ✓ shows ✓ once
const agents: Agent[] = [{ agentId: 'main', type: 'main', tag: 'main', description: '', model: 'opus', startedAt: 0, reads: 0, edits: 0, asks: 0 }]
const readme = change({ path: 'README.md', at: 1 })
const tok = change({ path: 'src/token.ts', at: 2 })
const lastOk = new Map<string, number>()
let withRuns = attachRun([readme, tok], agents, { kind: 'test', runner: 'vitest', ok: false, at: 3 }, 'main', lastOk)
assert.equal(withRuns[0]!.test, undefined)
assert.equal(withRuns[1]!.test?.ok, false)
withRuns = attachRun(withRuns, agents, { kind: 'test', runner: 'vitest', ok: true, at: 4 }, 'main', lastOk)
assert.equal(withRuns[1]!.test?.ok, true)
assert.equal(evidenceOf(withRuns, withRuns).testsAfter, 1)
const later = change({ path: 'src/later.ts', at: 5 })
withRuns = attachRun([...withRuns, later], agents, { kind: 'test', runner: 'vitest', ok: true, at: 6 }, 'main', lastOk)
assert.equal(withRuns[1]!.test?.at, 4) // already covered by a passing run; not re-attached
assert.equal(withRuns[2]!.test?.at, 6)
assert.ok(has(rescore(withRuns)[2]!, /^✓ tested vitest$/))
const sub: Agent = { agentId: 's1', type: 'test-engineer', tag: 'test-enginee', description: 'd', model: 'haiku', startedAt: 0, endedAt: 9, reads: 0, edits: 0, asks: 0 }
const subChange = change({ path: 'src/sub.ts', agentId: 's1', at: 7 })
assert.equal(attachRun([subChange], [...agents, sub], { kind: 'check', runner: 'tsc', ok: true, at: 8 }, 'main', new Map())[0]!.check?.ok, true) // main's run covers an ended subagent

// evidence, files and the derived explanation
const shared = [change({ path: 'src/s.ts', at: 1 }), change({ path: 'src/s.ts', agentId: 'a1', at: 2, hunks: [hunk(1, ['-b', '+c'])] })]
assert.equal(evidenceOf(shared, shared).sharedFiles, 1)
const files = fileRows(shared, [agents[0]!, { ...sub, agentId: 'a1' }])
assert.equal(files[0]?.agents.length, 2)
assert.deepEqual(files[0]?.overlap, { from: 1, to: 1 })
assert.deepEqual(files[0]?.agents.map(a => a.tag), ['main', 'test-enginee'])
assert.equal(colorFor('main', 0), 'text')
assert.notEqual(colorFor('a', 0), colorFor('b', 1)) // two subagents, two colours
assert.equal(colorFor('x', 8), colorFor('y', 0)) // the palette wraps

const sharedAgents = [agents[0]!, { ...sub, agentId: 'a1' }]
assert.deepEqual(howOf(change({ hunks: [hunk(41, ['-if (a < b)', '+if (a <= b)'])], importerPaths: ['src/x.ts', 'src/y.ts'] })), ['Edits lines 41 (+1 −1).', '2 files import it: x.ts, y.ts.'])
assert.deepEqual(howOf(change({ isNew: true, hunks: [hunk(1, ['+export function parse(s: string) {', '+  return s', '+}'])], importerPaths: [] })), ['New file with 3 lines.', 'Adds parse.', 'No file imports it.'])
assert.deepEqual(howOf(change({ hunks: [hunk(3, ['-  x', '+x'])] })), ['Changes only whitespace or comments.', 'No file imports it.'])
assert.deepEqual(howOf(change({ isDeleted: true, hunks: [] })), ['The file is deleted.'])
assert.deepEqual(nextOf(shared[0]!, shared, sharedAgents, files[0]), ['Check the changes of test-enginee in this file. Lines 1 overlap.', 'Run the tests that cover s.ts.'])
assert.deepEqual(nextOf(change({ why: '', whySource: 'none', test: { runner: 'vitest', ok: true, at: 2 } }), [], sharedAgents, undefined), ['No reason is recorded. Ask main.'])
assert.deepEqual(nextOf(change({ test: { runner: 'vitest', ok: false, at: 2 }, why: 'because' }), [], sharedAgents, undefined), ['Fix the failing vitest run.'])
assert.deepEqual(nextOf(change({ test: { runner: 'vitest', ok: true, at: 2 }, why: 'because' }), [], sharedAgents, undefined), ['The tests pass. No step is necessary.'])
assert.deepEqual(nextOf(change({ isReverted: true }), [], sharedAgents, undefined), ['The change is reverted. No step is necessary.'])
const implX = change({ path: 'src/parse.ts', why: 'w' })
const testOnlyX = change({ path: 'src/parse.test.ts', why: 'w' })
assert.deepEqual(nextOf(implX, [implX, testOnlyX], sharedAgents, undefined), ['Run parse.test.ts. It is changed but not run.'])

// why
assert.equal(firstSentence('Fix the expiry check. Then add tests.'), 'Fix the expiry check.')
assert.ok(firstSentence(`${'word '.repeat(60)}end`).endsWith('…'))
const msgs = [
  { role: 'assistant' as const, text: 'Expiry used < so a token valid at :00 was refused.', toolUses: [] },
  { role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'tu1' }] },
]
assert.deepEqual(whyOf(msgs, 'tu1', 'write tests'), { why: 'Expiry used < so a token valid at :00 was refused.', whySource: 'captured' })
// one model message stored as rows: its text, then one row per tool use; the results follow as user rows.
// The text is found behind parallel tool rows; it is never taken from an earlier message across a user row.
const msg = [
  { role: 'assistant' as const, text: 'Old reason from an earlier message.', toolUses: [{ tool_use_id: 'old' }] },
  { role: 'user' as const, text: '', toolUses: [], toolResults: [{ tool_use_id: 'old' }] },
  { role: 'assistant' as const, text: 'Bump the version so the tracer sees it.', toolUses: [] },
  { role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'plan' }] },
  { role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'tu2' }] },
  { role: 'user' as const, text: '', toolUses: [], toolResults: [{ tool_use_id: 'plan' }] },
  { role: 'user' as const, text: '', toolUses: [], toolResults: [{ tool_use_id: 'tu2' }] },
]
assert.deepEqual(whyOf(msg, 'tu2', ''), { why: 'Bump the version so the tracer sees it.', whySource: 'captured' })
assert.deepEqual(whyOf(msg, 'plan', ''), { why: 'Bump the version so the tracer sees it.', whySource: 'captured' })
assert.deepEqual(whyOf([msg[0]!, msg[1]!, ...msg.slice(3)], 'tu2', 'spawned'), { why: 'spawned', whySource: 'spawn' }) // a message with no text row: never the earlier message's sentence
// main, no text row and no description: the latest user prompt, without host blocks; a result-only user row is skipped
const prompted = [
  { role: 'user' as const, text: 'Make the pane show cards. Then colour them.', toolUses: [] },
  { role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'a' }] },
  { role: 'user' as const, text: '', toolUses: [] },
  { role: 'user' as const, text: '<system-reminder>\nignore this\n</system-reminder>', toolUses: [] },
  { role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'tu3' }] },
]
assert.deepEqual(whyOf(prompted, 'tu3', ''), { why: 'Make the pane show cards.', whySource: 'prompt' })
assert.deepEqual(whyOf(prompted.slice(1), 'tu3', ''), { why: '', whySource: 'none' })
assert.equal(summaryOutcome(' 3 pass\n 0 fail\nRan 3 tests across 1 file.'), true)
assert.equal(summaryOutcome(' 2 pass\n 1 fail\nRan 3 tests across 1 file.'), false)
assert.equal(summaryOutcome('Ran 3 tests'), null)
assert.deepEqual(whyOf([], 'tu9', 'write tests'), { why: 'write tests', whySource: 'spawn' })
assert.deepEqual(whyOf([], 'tu9', ''), { why: '', whySource: 'none' })

// export
const md = toMarkdown('app', 'main', rescore([impl, test]), agents)
assert.ok(md.includes('## main') && md.includes('### src/parse.ts:1-3') && md.includes('```diff') && md.includes('**Why:** because') && md.includes('**Ambition +'))
assert.ok(!/\d+\/10\b/.test(md))

console.log('code-tracer check: ok')
