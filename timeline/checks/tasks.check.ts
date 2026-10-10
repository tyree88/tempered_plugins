// Self-check for the task mirror. Run: node timeline/checks/tasks.check.ts
import assert from 'node:assert/strict'
import { applyTaskCall, createdId, fromTaskList, isBlocked } from '../hooks/tasks.ts'
import type { Task } from '../types/index.d.ts'

let list: Task[] = []
list = applyTaskCall(list, 'TaskCreate', { subject: ' Build pane ' }, '3')
assert.deepEqual(list, [{ id: '3', subject: 'Build pane', status: 'pending', blockedBy: [] }])
list = applyTaskCall(list, 'TaskCreate', { subject: 'Write test' }, 'c2')
assert.equal(list[1]?.id, 'c2')
// the new id: the structured result first, then "#<n>" in the text, else none (the caller counts its own)
assert.equal(createdId({ task: { id: '7', subject: 'x' } }, 'Task #3 created'), '7')
assert.equal(createdId('ok', 'Task #3 created successfully: Build pane'), '3')
assert.equal(createdId(undefined, 'created'), undefined)
list = applyTaskCall(list, 'TaskUpdate', { taskId: '3', status: 'in_progress' }, 'x')
assert.equal(list[0]?.status, 'in_progress')
list = applyTaskCall(list, 'TaskUpdate', { taskId: 'c2', addBlockedBy: ['#3'] }, 'x')
assert.deepEqual(list[1]?.blockedBy, ['3'])
assert.ok(isBlocked(list[1]!, list))
list = applyTaskCall(list, 'TaskUpdate', { taskId: '3', status: 'completed', subject: 'Build the pane' }, 'x')
assert.equal(list[0]?.subject, 'Build the pane')
assert.ok(!isBlocked(list[1]!, list))
list = applyTaskCall(list, 'TaskUpdate', { taskId: '99', status: 'completed' }, 'x') // unknown id: no change
assert.equal(list.length, 2)
list = applyTaskCall(list, 'TaskUpdate', { taskId: 'c2', status: 'deleted' }, 'x')
assert.deepEqual(list.map(t => t.id), ['3'])
list = applyTaskCall(list, 'TodoWrite', { todos: [
  { content: 'a', status: 'completed', activeForm: 'A' },
  { content: ' ', status: 'pending', activeForm: '' },
  { content: 'b', status: 'weird', activeForm: 'B' },
] }, 'x')
assert.deepEqual(list, [
  { id: 't0', subject: 'a', status: 'completed', blockedBy: [] },
  { id: 't2', subject: 'b', status: 'pending', blockedBy: [] },
])
// addBlocks: the other task waits on this one; a numeric taskId works
let g: Task[] = []
g = applyTaskCall(g, 'TaskCreate', { subject: 'A' }, '1')
g = applyTaskCall(g, 'TaskCreate', { subject: 'B' }, '2')
g = applyTaskCall(g, 'TaskUpdate', { taskId: '1', addBlocks: ['#2'] }, 'x')
assert.deepEqual(g.map(t => t.blockedBy), [[], ['1']])
assert.ok(isBlocked(g[1]!, g))
g = applyTaskCall(g, 'TaskUpdate', { taskId: 1, status: 'completed' }, 'x')
assert.equal(g[0]?.status, 'completed')
assert.ok(!isBlocked(g[1]!, g))
// TaskList: the result's tasks replace the mirror; bad rows are dropped, a wrong shape is null
assert.deepEqual(fromTaskList({ tasks: [
  { id: '1', subject: 'A', status: 'completed', blockedBy: [] },
  { id: 2, subject: ' B ', status: 'weird', owner: 'me', blockedBy: ['#1', 7] },
  { id: '3', subject: ' ', status: 'pending', blockedBy: [] },
] }), [
  { id: '1', subject: 'A', status: 'completed', blockedBy: [] },
  { id: '2', subject: 'B', status: 'pending', blockedBy: ['1', '7'] },
])
assert.deepEqual(fromTaskList({ tasks: [] }), [])
assert.equal(fromTaskList({ tasks: [{ nope: 1 }] }), null) // rows exist but none parse: keep the mirror
assert.equal(fromTaskList('3 tasks'), null)
assert.equal(fromTaskList(undefined), null)
assert.deepEqual(applyTaskCall(list, 'Bash', { command: 'ls' }, 'x'), list)
assert.deepEqual(applyTaskCall(list, 'TodoWrite', { todos: 'nope' }, 'x'), list)
console.log('tasks: ok')
