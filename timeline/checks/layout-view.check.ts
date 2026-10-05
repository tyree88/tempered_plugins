import assert from 'node:assert/strict'
import { paginate, summarize } from '../hooks/layout.ts'

const w = (id: string, task: string, status: string, agentId?: string) => ({
  v: 1, id, at: `2026-10-04T20:00:0${id}.000Z`, session: 'me', kind: 'work', title: task, task, status,
  ...(agentId ? { agentId } : {}),
})
assert.equal(
  summarize([w('1', 'a', 'active'), w('2', 'a', 'done'), w('3', 'b', 'blocked'), w('4', 'c', 'active'), w('5', 'x', 'active', 'ag1')] as never, 'app', 0),
  'app · 3 tasks · 1 done · 1 blocked · 1 active',
)
assert.equal(summarize([], 'app', 2), 'app · no milestones logged yet · 2 lines unreadable')
assert.equal(summarize([], 'app', 1), 'app · no milestones logged yet · 1 line unreadable')

const nodes = Array.from({ length: 95 }, (_, i) => ({ kind: 'talk' as const, at: String(i), title: String(i) }))
const p0 = paginate(nodes, 0, 40)
assert.equal(p0.pages, 3)
assert.equal(p0.page, 0)
assert.equal(p0.nodes.length, 40)
assert.equal(p0.nodes[0]?.title, '55')
const p2 = paginate(nodes, 2, 40)
assert.equal(p2.nodes.length, 15)
assert.equal(p2.nodes[0]?.title, '0')
assert.equal(paginate(nodes, 9, 40).page, 2)
assert.deepEqual(paginate([], 0, 40), { nodes: [], page: 0, pages: 1 })
assert.equal(summarize([w('1', 'a', 'active')] as never, 'r', 0), 'r · 1 task · 0 done · 0 blocked · 1 active')
assert.equal(summarize([w('1', 'a', 'blocked'), w('2', 'a', 'done')] as never, 'r', 0), 'r · 1 task · 1 done · 0 blocked · 0 active')
const talkOnly = [{ v: 1, id: 't1', at: '2026-10-04T20:00:00.000Z', session: 'me', kind: 'talk', title: 'hi' }]
assert.equal(summarize(talkOnly as never, 'r', 0), 'r · no milestones logged yet')
assert.equal(paginate(nodes, -3, 40).page, 0)
assert.equal(paginate(nodes.slice(0, 40), 0, 40).pages, 1)
assert.equal(paginate(nodes.slice(0, 41), 0, 40).pages, 2)
console.log('layout-view: ok')
