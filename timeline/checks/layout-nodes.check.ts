import assert from 'node:assert/strict'
import { buildNodes } from '../hooks/layout.ts'

const at = (m: number) => `2026-10-04T20:${String(m).padStart(2, '0')}:00.000Z`
const base = (id: string, m: number, session = 'me') => ({ v: 1, id, at: at(m), session })

const entries = [
  { ...base('a', 0), kind: 'session', title: 'session me opened', event: 'open' },
  { ...base('b', 1), kind: 'talk', title: 'build the court lobby next' },
  { ...base('c', 2), kind: 'work', title: 'Court lobby UI', task: 'lobby', status: 'active', done: 1, total: 3, how: 'two subagents' },
  { ...base('d', 3), kind: 'fact', title: 'commit 9f3e1d2 feat: lobby', fact: { type: 'commit', ref: '9f3e1d2' }, attachTo: 'lobby' },
  { ...base('e', 4), kind: 'agent', title: 'lobby layout', agent: { id: 'ag1', phase: 'start', type: 'Explore', model: 'claude-haiku-4-5', isPinned: true, isBackground: false, parentTask: 'lobby' } },
  { ...base('f', 5), kind: 'work', title: 'layout', task: 'ag1', status: 'active', done: 2, total: 4, next: 'wire route', agentId: 'ag1' },
  { ...base('g', 6), kind: 'agent', title: 'nested', agent: { id: 'ag2', phase: 'start', type: 'general-purpose', model: 'claude-opus-5-5', isPinned: false, isBackground: true, parentAgentId: 'ag1' } },
  { ...base('h', 7), kind: 'agent', title: 'agent end', agent: { id: 'ag1', phase: 'end', status: 'done', durationMs: 400000, tools: 14, tokens: 38000, result: '3 strings rewritten' } },
  { ...base('i', 8), kind: 'fact', title: 'push main', fact: { type: 'push', ref: 'main' } },
  { ...base('j', 9, 'them'), kind: 'agent', title: 'their agent', agent: { id: 'ag3', phase: 'start', type: 'Explore', model: 'claude-haiku-4-5', isPinned: true, isBackground: false } },
  { ...base('k', 10), kind: 'work', title: 'Court lobby UI', task: 'lobby', status: 'blocked', done: 2, total: 3 },
]
const live = { ag2: { tools: 3, now: 'Bash pnpm test', startedAt: Date.parse(at(6)) } }
const nodes = buildNodes(entries as never, live, 'me', Date.parse(at(8)))

assert.deepEqual(nodes.map(n => n.kind), ['session', 'talk', 'work', 'agent', 'agent', 'fact', 'agent', 'work'])
const [, talk, card, ag1, ag2, , ag3, blocked] = nodes
assert.deepEqual(talk, { kind: 'talk', at: at(1), title: 'build the court lobby next' })
assert.deepEqual(card, {
  kind: 'work', at: at(2), title: 'Court lobby UI', task: 'lobby', tag: 1, status: 'active',
  done: 1, total: 3, how: 'two subagents', facts: ['commit 9f3e1d2 feat: lobby'],
})
assert.deepEqual(ag1, {
  kind: 'agent', at: at(4), id: 'ag1', title: 'lobby layout', depth: 1, type: 'Explore', model: 'claude-haiku-4-5',
  isPinned: true, isBackground: false, state: 'done', tools: 14, elapsedMs: 400000, tokens: 38000,
  result: '3 strings rewritten', next: 'wire route', done: 2, total: 4,
})
assert.deepEqual(ag2, {
  kind: 'agent', at: at(6), id: 'ag2', title: 'nested', depth: 2, type: 'general-purpose', model: 'claude-opus-5-5',
  isPinned: false, isBackground: true, state: 'running', tools: 3, elapsedMs: 120000, now: 'Bash pnpm test',
})
assert.equal(ag3?.kind === 'agent' && ag3.state, 'running')
assert.deepEqual(blocked, {
  kind: 'work', at: at(10), title: 'Court lobby UI', task: 'lobby', tag: 1, status: 'blocked', done: 2, total: 3, facts: [],
})

const lone = buildNodes(
  [{ ...base('z', 0), kind: 'agent', title: 'lost', agent: { id: 'ag9', phase: 'start', type: 'Explore', model: 'm', isPinned: true, isBackground: false } }] as never,
  {}, 'me', 0,
)
assert.equal(lone[0]?.kind === 'agent' && lone[0].state, 'unknown')

const more = buildNodes(
  [
    { ...base('m1', 0, 'old'), kind: 'agent', title: 'stale', agent: { id: 'x1', phase: 'start', type: 'Explore', model: 'm', isPinned: true, isBackground: false } },
    { ...base('m2', 1, 'old'), kind: 'session', title: 'session old closed', event: 'close' },
    { ...base('m3', 2), kind: 'agent', title: 'twice', agent: { id: 'x2', phase: 'start', type: 'Explore', model: 'm', isPinned: true, isBackground: false } },
    { ...base('m4', 3), kind: 'agent', title: 'agent end', agent: { id: 'x2', phase: 'end', status: 'done', durationMs: 1000, tokens: 50, result: 'first' } },
    { ...base('m5', 4), kind: 'agent', title: 'agent end', agent: { id: 'x2', phase: 'end', status: 'failed', durationMs: 2000 } },
    { ...base('m6', 5), kind: 'work', title: 'ghost log', task: 'x9', agentId: 'x9', status: 'active', done: 1, total: 2 },
    { ...base('m7', 6), kind: 'fact', title: 'orphan fact', fact: { type: 'push', ref: 'main' }, attachTo: 'nope' },
    { ...base('m8', 7), kind: 'work', title: 'A', task: 'a', status: 'active' },
    { ...base('m9', 8), kind: 'work', title: 'B', task: 'b', status: 'active' },
    { ...base('m10', 9), kind: 'work', title: 'A again', task: 'a', status: 'active' },
    { ...base('m11', 10), kind: 'fact', title: 'late fact', fact: { type: 'commit', ref: 'abc1234' }, attachTo: 'a' },
    { ...base('m12', 11), kind: 'agent', title: 'odd', agent: 'x' },
  ] as never,
  {}, 'me', 0,
)
assert.deepEqual(more.map(n => n.kind), ['agent', 'session', 'agent', 'fact', 'work', 'work', 'work'])
const [x1, , x2, , a1, b1, a2] = more
assert.equal(x1?.kind === 'agent' && x1.state, 'unknown')
assert.deepEqual(x2, {
  kind: 'agent', at: at(2), id: 'x2', title: 'twice', depth: 1, type: 'Explore', model: 'm',
  isPinned: true, isBackground: false, state: 'failed', tools: 0, elapsedMs: 2000,
})
assert.equal(b1?.kind === 'work' && b1.tag, 2)
assert.deepEqual(a1?.kind === 'work' && a1.facts, [])
assert.deepEqual(a2?.kind === 'work' && a2.facts, ['late fact'])

const chain = Array.from({ length: 8 }, (_, i) => ({
  ...base(`c${i}`, i), kind: 'agent', title: `c${i}`,
  agent: { id: `c${i}`, phase: 'start', type: 't', model: 'm', isPinned: true, isBackground: false, ...(i ? { parentAgentId: `c${i - 1}` } : {}) },
}))
assert.equal(Math.max(...buildNodes(chain as never, {}, 'me', 0).map(n => (n.kind === 'agent' ? n.depth : 0))), 4)

console.log('layout-nodes: ok')
