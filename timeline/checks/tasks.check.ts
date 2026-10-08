// Self-check for the task mirror. Run: node timeline/checks/tasks.check.ts
import assert from 'node:assert/strict'
import { applyTaskCall, isBlocked } from '../hooks/tasks.ts'
import type { Task } from '../types/index.d.ts'

let list: Task[] = []
list = applyTaskCall(list, 'TaskCreate', { subject: ' Build pane ' }, 'Task #3 created successfully: Build pane', 'c1')
assert.deepEqual(list, [{ id: '3', subject: 'Build pane', status: 'pending', blockedBy: [] }])
list = applyTaskCall(list, 'TaskCreate', { subject: 'Write test' }, 'created', 'c2') // no id in the result
assert.equal(list[1]?.id, 'c2')
list = applyTaskCall(list, 'TaskUpdate', { taskId: '3', status: 'in_progress' }, '', 'x')
assert.equal(list[0]?.status, 'in_progress')
list = applyTaskCall(list, 'TaskUpdate', { taskId: 'c2', addBlockedBy: ['#3'] }, '', 'x')
assert.deepEqual(list[1]?.blockedBy, ['3'])
assert.ok(isBlocked(list[1]!, list))
list = applyTaskCall(list, 'TaskUpdate', { taskId: '3', status: 'completed', subject: 'Build the pane' }, '', 'x')
assert.equal(list[0]?.subject, 'Build the pane')
assert.ok(!isBlocked(list[1]!, list))
list = applyTaskCall(list, 'TaskUpdate', { taskId: '99', status: 'completed' }, '', 'x') // unknown id: no change
assert.equal(list.length, 2)
list = applyTaskCall(list, 'TaskUpdate', { taskId: 'c2', status: 'deleted' }, '', 'x')
assert.deepEqual(list.map(t => t.id), ['3'])
list = applyTaskCall(list, 'TodoWrite', { todos: [
  { content: 'a', status: 'completed', activeForm: 'A' },
  { content: ' ', status: 'pending', activeForm: '' },
  { content: 'b', status: 'weird', activeForm: 'B' },
] }, '', 'x')
assert.deepEqual(list, [
  { id: 't0', subject: 'a', status: 'completed', blockedBy: [] },
  { id: 't2', subject: 'b', status: 'pending', blockedBy: [] },
])
assert.deepEqual(applyTaskCall(list, 'Bash', { command: 'ls' }, '', 'x'), list)
assert.deepEqual(applyTaskCall(list, 'TodoWrite', { todos: 'nope' }, '', 'x'), list)
console.log('tasks: ok')
