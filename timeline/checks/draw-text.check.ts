import assert from 'node:assert/strict'
import { bar, cardLines, fit, hhmm, renderText } from '../hooks/draw.ts'

assert.equal(fit(`${'x'.repeat(8)}😀 tail`, 10), `${'x'.repeat(8)}…`)
assert.equal(fit('short', 10), 'short')
assert.equal(bar(2, 4, 10), '█████░░░░░')
assert.equal(bar(0, 3, 6), '░░░░░░')
assert.equal(bar(9, 3, 4), '████')
assert.equal(bar(-5, 3, 4), '░░░░')
assert.equal(bar(1, 0, 3), '░░░')
assert.equal(bar(Number.NaN, 3, 4), '░░░░')
assert.equal(hhmm('2026-10-04T20:02:00.000Z', -300), '15:02')
assert.equal(hhmm('2026-10-04T23:30:00.000Z', 330), '05:00')

const work = {
  kind: 'work' as const, at: '2026-10-04T20:40:00.000Z', title: 'Court lobby UI', task: 'lobby', tag: 1,
  status: 'active' as const, done: 1, total: 3, how: 'two subagents', next: 'wire route', facts: ['PR #318', 'CI ⏳'],
}
assert.deepEqual(cardLines(work), ['███░░░░░░░ 1/3  active', 'how: two subagents', 'next: wire route', '↳ PR #318', '↳ CI ⏳'])
assert.deepEqual(cardLines({ ...work, how: undefined, next: undefined, facts: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), [
  '███░░░░░░░ 1/3  active', '↳ +2 earlier', '↳ c', '↳ d', '↳ e', '↳ f', '↳ g',
])

const agent = {
  kind: 'agent' as const, at: '2026-10-04T20:41:00.000Z', id: 'ag2', title: 'lobby copy', depth: 1,
  type: 'general-purpose', model: 'claude-opus-5-5', isPinned: false, isBackground: false, state: 'running' as const,
  elapsedMs: 192000, tools: 14, tokens: 38000, now: 'Bash pnpm test', next: 'wire route', done: 2, total: 4,
}
assert.deepEqual(cardLines(agent), [
  'general-purpose · claude-opus-5-5',
  '⚠ no model set: inherited',
  '█████░░░░░ 2/4  running · 3m12s',
  'now: Bash pnpm test',
  'next: wire route',
  '14 tool calls · 38k tokens',
])
assert.deepEqual(
  cardLines({ ...agent, isPinned: true, model: 'claude-haiku-4-5', state: 'done', now: undefined, next: undefined, total: undefined, done: undefined, result: '3 strings rewritten' }),
  ['general-purpose · claude-haiku-4-5 (pinned)', 'done · 3m12s', '14 tool calls · 38k tokens', 'result: 3 strings rewritten'],
)

const nodes = [
  { kind: 'session' as const, at: '2026-10-04T19:02:00.000Z', title: 'session abc12345 opened' },
  { kind: 'talk' as const, at: '2026-10-04T20:38:00.000Z', title: 'build the court lobby next' },
  work,
  agent,
]
const wide = renderText(nodes, 100, -300)
for (const line of wide) assert.ok(line.text.length <= 100, `too wide: ${line.text}`)
assert.match(wide[0]!.text, /^┄+ session abc12345 opened · 14:02 ┄+$/)
assert.equal(wide[0]!.tone, 'dim')
assert.ok(wide[1]!.text.endsWith('build the court lobby next ◀─┤ 15:38'))
assert.ok(wide[2]!.text.endsWith('15:40 ├─▶ #1 Court lobby UI'))
assert.equal(wide[2]!.tone, 'accent')
assert.ok(wide[3]!.text.endsWith('  │    ███░░░░░░░ 1/3  active'))
assert.ok(wide.some(l => l.text.endsWith('◆ lobby copy')))
assert.ok(wide.some(l => l.tone === 'warn' && l.text.includes('⚠ no model set')))

const narrow = renderText(nodes, 60, -300)
for (const line of narrow) assert.ok(line.text.length <= 60, `too wide: ${line.text}`)
assert.equal(narrow[1]!.text, 'you: build the court lobby next')
assert.equal(narrow[2]!.text, '15:40 #1 Court lobby UI')
assert.equal(narrow[3]!.text, '   ███░░░░░░░ 1/3  active')

assert.equal(hhmm('not a date', 0), '--:--')
const bg = { ...agent, depth: 4, isBackground: true, state: 'failed' as const, tools: 1 }
for (const cols of [20, 8]) for (const line of renderText([bg], cols, 0)) assert.ok(line.text.length <= cols, `${cols}: ${line.text}`)
const bgWide = renderText([bg], 100, 0)
assert.ok(bgWide[0]!.text.endsWith('◇ lobby copy'))
assert.equal(bgWide[0]!.tone, 'warn')
assert.ok(bgWide.some(l => l.text.includes('1 tool call · 38k tokens')))
assert.equal(renderText([{ ...work, status: 'blocked' as const }], 100, 0)[0]!.tone, 'warn')
const fact = { kind: 'fact' as const, at: '2026-10-04T20:45:00.000Z', title: 'push main' }
assert.ok(renderText([fact], 100, -300)[0]!.text.endsWith('15:45 ├· ↳ push main'))
assert.equal(renderText([fact], 60, -300)[0]!.text, '15:45 ↳ push main')
assert.equal(cardLines({ ...agent, elapsedMs: Number.NaN, tokens: 'abc' as never }).at(-1), '14 tool calls')
assert.ok(!cardLines({ ...agent, type: 'fork' }).some(l => l.startsWith('⚠')))

console.log('draw-text: ok')
