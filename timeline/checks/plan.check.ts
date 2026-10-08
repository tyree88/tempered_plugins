// Self-check for the plan parser. Run: node timeline/checks/plan.check.ts
import assert from 'node:assert/strict'
import { currentGroup, hasBoxes, parsePlan } from '../hooks/plan.ts'

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
assert.ok(hasBoxes('text\n  - [ ] x'))
assert.ok(!hasBoxes('[ ] not a list item'))
console.log('plan: ok')
