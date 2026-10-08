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

const p = buildPanel(nodes, tasks, plan, 0, 4)
assert.equal(p.goal, 'Pane Redesign')
assert.deepEqual(p.plan, { group: 'Task 2', done: 2, total: 5 })
assert.deepEqual(p.nowAgents.map(a => a.id), ['a2'])
assert.deepEqual(p.nowTasks.map(t => t.id), ['2'])
assert.deepEqual(p.next.map(t => t.id), ['4', '5', '6', '7', '8'])
assert.equal(p.nextMore, 1)
assert.deepEqual(p.blocked, [{ title: 'Panel', waitsOn: '2' }, { title: 'Wait for hosted DB' }])
assert.equal(p.pages, 2) // 6 history rows, 4 per page
assert.equal(p.history[0]?.text, 'Pane drawn 2/2 ↳ push feat/x') // newest first
assert.equal(p.history[0]?.glyph, '✓')
assert.equal(p.history[1]?.glyph, '▶') // running agent
assert.equal(buildPanel(nodes, tasks, plan, 1, 4).history.at(-1)?.glyph, '💬')
assert.equal(buildPanel(nodes, tasks, plan, 9, 4).page, 1) // clamps
// goal falls back to the latest active main-loop work; plan bar hides when nothing is ticked
const q = buildPanel(nodes.slice(0, 3), [], { ...plan, title: '', done: 0 }, 0, 30)
assert.equal(q.goal, 'Design the pane')
assert.equal(q.plan, undefined)
const empty = buildPanel([], [], null, 0, 30)
assert.equal(empty.history.length, 0)
assert.equal(empty.goal, undefined)
console.log('layout-panel: ok')
