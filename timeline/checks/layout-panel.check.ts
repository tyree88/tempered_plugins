// Self-check for the panel model. Run: node timeline/checks/layout-panel.check.ts
import assert from 'node:assert/strict'
import { buildPanel } from '../hooks/layout.ts'

const agent = (id: string, state: string, at: string) => ({
  kind: 'agent', at, id, title: `agent ${id}`, depth: 1, type: 'general-purpose', model: 'sonnet',
  isPinned: true, isBackground: false, state, tools: 3,
})
const nodes = [
  { kind: 'talk', at: '2026-10-07T10:00:00Z', title: 'User: build the pane' },
  { kind: 'work', at: '2026-10-07T10:01:00Z', title: 'Design the pane', task: 'pane', tag: 1, status: 'active', facts: [] },
  { kind: 'work', at: '2026-10-07T10:02:00Z', title: 'Wait for hosted DB', task: 'db', tag: 2, status: 'blocked', facts: [] },
  agent('a1', 'done', '2026-10-07T10:03:00Z'),
  agent('a2', 'running', '2026-10-07T10:04:00Z'),
  { kind: 'work', at: '2026-10-07T10:05:00Z', title: 'Pane drawn', task: 'pane', tag: 1, status: 'done', done: 2, total: 2, facts: ['push feat/x'] },
] as never[]
const tasks = [
  { id: '1', subject: 'Types', status: 'completed', blockedBy: [] },
  { id: '2', subject: 'Parser', status: 'in_progress', blockedBy: [] },
  { id: '3', subject: 'Panel', status: 'pending', blockedBy: ['2'] },
  ...['4', '5', '6', '7', '8', '9'].map(id => ({ id, subject: `Step ${id}`, status: 'pending', blockedBy: [] })),
] as never[]
const plan = { title: 'Pane Redesign', groups: [{ name: 'Task 1', done: 2, total: 2 }, { name: 'Task 2', done: 0, total: 3 }], done: 2, total: 5 }

const now = Date.parse('2026-10-07T12:00:00Z')
const p = buildPanel(nodes, tasks, plan, 0, 4, now)
assert.equal(p.goal, 'Pane Redesign')
assert.deepEqual(p.plan, { group: 'Task 2', done: 2, total: 5 })
assert.deepEqual(p.nowAgents.map(a => a.id), ['a2'])
assert.deepEqual(p.nowTasks.map(t => t.id), ['2'])
assert.deepEqual(p.next.map(t => t.id), ['4', '5', '6', '7', '8'])
assert.equal(p.nextMore, 1)
assert.deepEqual(p.blocked, [{ title: 'Panel', waitsOn: '2' }, { title: 'Wait for hosted DB' }])
// an in-progress task that waits on an open one shows in NOW only, never in BLOCKED
const running = [...tasks, { id: '10', subject: 'Wired', status: 'in_progress', blockedBy: ['3'] }] as never[]
const r = buildPanel(nodes, running, plan, 0, 4, now)
assert.ok(r.nowTasks.some(t => t.id === '10'))
assert.ok(!r.blocked.some(b => b.title === 'Wired'))
assert.equal(p.pages, 2) // 6 history rows, 4 per page
assert.equal(p.history[0]?.text, 'Pane drawn 2/2 ↳ push feat/x') // newest first
assert.equal(p.history[0]?.glyph, '✓')
assert.equal(p.history[1]?.glyph, '▶') // running agent
assert.equal(buildPanel(nodes, tasks, plan, 1, 4, now).history.at(-1)?.glyph, '💬')
assert.equal(buildPanel(nodes, tasks, plan, 9, 4, now).page, 1) // clamps
// goal falls back to the latest active main-loop work; plan bar hides when nothing is ticked
const q = buildPanel(nodes.slice(0, 3), [], { ...plan, title: '', done: 0 }, 0, 30, now)
assert.equal(q.goal, 'Design the pane')
assert.equal(q.plan, undefined)
// a task logged active and later done is not the goal; only the still-active one is
const work = (at: string, title: string, task: string, status: string) => ({ kind: 'work', at, title, task, tag: 1, status, facts: [] })
const abb = [work('2026-10-07T10:01:00Z', 'Task A', 'a', 'active'), work('2026-10-07T10:02:00Z', 'Task B', 'b', 'active'), work('2026-10-07T10:03:00Z', 'Task B', 'b', 'done')] as never[]
assert.equal(buildPanel(abb, [], null, 0, 30, now).goal, 'Task A')
assert.equal(buildPanel(abb.slice(0, 1).concat(work('2026-10-07T10:04:00Z', 'Task A', 'a', 'done') as never), [], null, 0, 30, now).goal, undefined)
// log state from an earlier day is history only: not the goal, not blocked
const old = [work('2026-10-05T10:00:00Z', 'Old active', 'o1', 'active'), work('2026-10-05T10:01:00Z', 'Old blocked', 'o2', 'blocked')] as never[]
const o = buildPanel(old, [], null, 0, 30, now)
assert.equal(o.goal, undefined)
assert.deepEqual(o.blocked, [])
assert.equal(o.history.length, 2)
// a finished plan is not the goal: it falls back to the active work (the bar still shows)
const fin = buildPanel(nodes.slice(0, 3), [], { title: 'Pane Redesign', groups: [{ name: 'Task 1', done: 5, total: 5 }], done: 5, total: 5 }, 0, 30, now)
assert.equal(fin.goal, 'Design the pane')
assert.deepEqual(fin.plan, { done: 5, total: 5 })
// a running agent with no live clock from days ago (another session's, never ended) is history, not NOW
const stale = buildPanel([agent('a3', 'running', '2026-10-04T12:00:00Z')] as never[], [], null, 0, 30, now)
assert.deepEqual(stale.nowAgents, [])
assert.equal(stale.history.length, 1)
// failed and unknown agents say so in history
const ended = buildPanel([agent('f', 'failed', '2026-10-07T10:00:00Z'), agent('u', 'unknown', '2026-10-07T10:01:00Z')] as never[], [], null, 0, 30, now)
assert.deepEqual(ended.history.map(r => [r.glyph, r.tone, r.text]), [
  ['?', 'dim', 'general-purpose · sonnet — agent u (status unknown)'],
  ['✗', 'fail', 'general-purpose · sonnet — agent f failed'],
])
// session open/close rows are not history, so a fresh session shows the empty state
const empty = buildPanel([{ kind: 'session', at: '2026-10-07T11:00:00Z', title: 'session abc opened' }] as never[], [], null, 0, 30, now)
assert.equal(empty.history.length, 0)
assert.equal(empty.goal, undefined)
console.log('layout-panel: ok')
