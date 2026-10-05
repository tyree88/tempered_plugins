import assert from 'node:assert/strict'
import { renderSvg } from '../hooks/draw.ts'

const card = (i: number) => ({
  kind: 'work' as const,
  at: `2026-10-04T20:${String(i % 60).padStart(2, '0')}:00.000Z`,
  title: `Task ${i} with a long descriptive title`,
  task: `t${i}`,
  tag: i,
  status: i % 7 === 0 ? ('blocked' as const) : ('active' as const),
  done: i % 4,
  total: 4,
  how: 'x'.repeat(200),
  next: 'y'.repeat(120),
  facts: ['commit 9f3e1d2 feat: something long here', 'PR #318', 'CI ✓ 5 @9f3e1d2'],
})
const svg = renderSvg(Array.from({ length: 40 }, (_, i) => card(i)), -300)
assert.ok(svg.startsWith('<svg '))
assert.ok(svg.length < 131072, `svg too big: ${svg.length}`)
assert.equal(svg.match(/<g>/g)?.length, 40)
assert.equal(svg.match(/<animate /g)?.length, 1)
assert.ok(svg.includes('stroke="#d96a10"'), 'blocked card is orange')

// Worst case read back from disk: huge titles and 2000-character prompts on 40 agent cards.
const agentCard = (i: number) => ({
  kind: 'agent' as const, at: '2026-10-04T20:00:00.000Z', id: `ag${i}`, title: 'T<&'.repeat(1000), depth: 1 + (i % 3),
  type: 'general-purpose', model: 'claude-opus-5-5', isPinned: false, isBackground: i % 2 === 0, state: 'running' as const,
  tools: 99, tokens: 123456, now: 'Bash pnpm test', next: 'n'.repeat(500), done: 1, total: 2, result: 'r'.repeat(500),
  prompt: '<p&>'.repeat(500),
})
const heavy = renderSvg(Array.from({ length: 40 }, (_, i) => agentCard(i)), 0)
assert.ok(heavy.length < 131072, `heavy svg too big: ${heavy.length}`)

const tricky = renderSvg([{ kind: 'talk', at: '2026-10-04T20:00:00.000Z', title: 'a<b & "c"' }], 0)
assert.ok(tricky.includes('a&lt;b &amp; &quot;c&quot;'))
assert.ok(!tricky.includes('a<b'))
const amp = Array.from({ length: 40 }, (_, i) => ({
  ...card(i), title: '&'.repeat(300), how: '&'.repeat(200), next: '&'.repeat(120), facts: Array.from({ length: 7 }, () => '&'.repeat(80)),
}))
const ampSvg = renderSvg(amp, 0)
assert.ok(ampSvg.length < 131072, `amp svg too big: ${ampSvg.length}`)
assert.ok(!ampSvg.includes('<title>'), 'over-budget drawing fell back to no hover text')
const ctl = renderSvg([{ kind: 'talk', at: '2026-10-04T20:00:00.000Z', title: 'a\u0007b\u001bc\uD800d' }], 0)
assert.ok(ctl.includes('>abcd</text>'))
assert.ok(!/[\u0007\u001b]/.test(ctl))
assert.ok(renderSvg([{ ...card(1), status: 'done' as const }], 0).includes('✓ #1'))
assert.ok(renderSvg([{ ...agentCard(0), state: 'failed' as const }], 0).includes('class="h w"'))
const sf = renderSvg([
  { kind: 'session', at: '2026-10-04T20:00:00.000Z', title: 'session abc opened' },
  { kind: 'fact', at: '2026-10-04T20:01:00.000Z', title: 'push main' },
], 0)
assert.equal(sf.match(/<g>/g)?.length, 2)
assert.ok(sf.includes('session abc opened · 20:00') && sf.includes('↳ push main'))
const empty = renderSvg([], 0)
assert.ok(empty.startsWith('<svg ') && empty.endsWith('</svg>') && empty.includes('prefers-color-scheme:dark'))
const deep = renderSvg([{ ...agentCard(0), depth: 4 }], 0)
assert.ok(Number(deep.match(/<rect x="\d+" y="\d+" width="(\d+)"/)?.[1]) > 0)
assert.equal(renderSvg(Array.from({ length: 40 }, (_, i) => card(i)), -300, { fade: false }).match(/<animate /g), null)
console.log('draw-svg: ok')
