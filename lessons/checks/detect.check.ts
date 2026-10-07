// Self-check for the pure logic. Run: node lessons/checks/detect.check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import { countDrafts, detect, isYes } from '../hooks/detect.ts'

const kind = (text: string, recent: string[] = []) => detect(text, recent)?.kind ?? null
const reason = (text: string, recent: string[] = []) => detect(text, recent)?.reason ?? null

// praise → win; questions, negation and bare thanks are not
assert.equal(reason('perfect, exactly what I wanted'), 'praise')
assert.equal(kind('you nailed it'), 'win')
assert.equal(kind('love this'), 'win')
assert.equal(kind("that's great, ship it"), 'win')
assert.equal(kind('is this exactly right?'), null)
assert.equal(kind('not perfect yet, keep going'), null)
assert.equal(kind("this isn't exactly it"), null)
assert.equal(kind('thanks!'), null)
assert.equal(kind('ok'), null)

// explicit asks
assert.equal(reason('log this win'), 'explicit')
assert.equal(kind('log this win'), 'win')
assert.equal(kind('add to learnings'), 'win')
assert.equal(reason('log this'), 'explicit')
assert.equal(kind('log this'), 'pitfall')
assert.equal(kind('add this to pitfalls'), 'pitfall')

// frustration → pitfall
for (const t of [
  'I already told you no bullets',
  'still wrong',
  'this is the third time',
  'why did you change the API',
  'not what I asked for',
  'ugh',
  'again, use the existing helper',
]) assert.equal(reason(t), 'frustration', t)
assert.equal(reason('STOP adding EXTRA comments'), 'frustration')
assert.equal(kind('parse the JSON from the HTTP response'), null) // acronyms are not shouting

// praise + correction → pitfall
assert.equal(kind('perfect, but again, no bullets please'), 'pitfall')

// repeated correction: ≥ 0.6 content-word overlap with a recent prompt, both ≥ 4 content words
const earlier = ['rename the helper function to formatPrice and update every caller']
assert.equal(reason('rename the helper function formatPrice and update every caller', earlier), 'repeated correction')
assert.equal(kind('run the tests', ['run the tests']), null) // too short
assert.equal(kind('write the migration for the orders table', earlier), null) // different words

// regressions: ordinary developer prompts must not nudge
for (const t of [
  'exactly 3 retries please',
  'make it exactly 80 chars wide',
  'make the layout pixel perfect',
  'can you log this error to sentry',
  "log this function's output",
  'why did you choose zod?',
  'the second time I click the button it throws',
  'update the README, CHANGELOG and LICENSE',
  'support GET, POST, PATCH and DELETE',
  'run it again please',
  "I'd love it if the header was sticky",
]) assert.equal(kind(t), null, t)
assert.equal(kind('fix the styling on page 3 of the report', ['fix the styling on page 2 of the report']), null) // digits keep pages apart

// regressions: explicit asks, standalone praise, praise that opens a request, extra frustration forms
for (const t of ['log this as a win', 'add this win to learnings', 'exactly', 'perfect, can you now add tests for it?'])
  assert.equal(kind(t), 'win', t)
for (const t of [
  'log this to pitfalls',
  'I told you not to touch the config',
  'no, I said use the helper',
  'still failing',
  'this is the second time we fixed this',
]) assert.equal(kind(t), 'pitfall', t)

// "y" replies
assert.ok(isYes('y'))
assert.ok(isYes('Yes'))
assert.ok(isYes('y, but severity High'))
assert.ok(!isYes('you should fix it'))
assert.ok(!isYes('yeah no'))

// drafts count only with the y/n question
assert.deepEqual(countDrafts('🌱 Win draft — NEW\nName: x\nLog it? y/n'), { win: 1, pitfall: 0 })
assert.deepEqual(countDrafts('⚠️ Pitfall draft — NEW\n...\n⚠ Pitfall draft — UPDATE: y\nLog it? y/n'), { win: 0, pitfall: 2 })
assert.deepEqual(countDrafts('🌱 Win draft without the question'), { win: 0, pitfall: 0 })
console.log('lessons: ok')
