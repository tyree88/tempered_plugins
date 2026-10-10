// Self-check for the plan parser. Run: node timeline/checks/plan.check.ts
import assert from 'node:assert/strict'
import { currentGroup, parsePlan } from '../hooks/plan.ts'

const md = [
  '# Pane Redesign Implementation Plan',
  '',
  '### Task 1: Types',
  '- [x] **Step 1: Branch**',
  '- [x] Step 2',
  '```bash',
  '# not a heading',
  '- [ ] not a box',
  '```',
  '### Task 2: Parser',
  '- [ ] Step 1',
  '* [X] Step 2',
  '### Notes',
  'no boxes here',
].join('\n')
const plan = parsePlan(md)
assert.ok(plan)
assert.equal(plan.title, 'Pane Redesign')
assert.deepEqual(plan.groups, [
  { name: 'Task 1: Types', done: 2, total: 2 },
  { name: 'Task 2: Parser', done: 1, total: 2 },
])
assert.equal(plan.done, 3)
assert.equal(plan.total, 4)
assert.equal(currentGroup(plan), 'Task 2: Parser')
assert.equal(parsePlan('# Just notes\n\nNo boxes.'), null)
assert.equal(parsePlan('- [ ] loose box')?.groups[0]?.name, 'Plan')
// a 4-backtick fence holds a bare ``` line without closing; boxes inside it count for nothing
const wide = parsePlan(['# T', '### G', '- [ ] real', '````md', '```', '- [ ] in fence', '```', '- [ ] still in fence', '````', '- [x] after'].join('\n'))
assert.deepEqual(wide?.groups, [{ name: 'G', done: 1, total: 2 }])
// a ~~~ fence is skipped, and a ``` line does not close it
const tilde = parsePlan(['# T', '### G', '~~~', '```', '- [ ] in fence', '~~~', '- [x] after'].join('\n'))
assert.deepEqual(tilde?.groups, [{ name: 'G', done: 1, total: 1 }])
// boxes only inside fences: no plan at all
assert.equal(parsePlan('# T\n```\n- [ ] x\n```\n'), null)
// an info string cannot close a fence
assert.equal(parsePlan('```\n```js\n- [ ] x\n```\n'), null)
console.log('plan: ok')
