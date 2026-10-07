// Self-check for the pure logic. Run: node followups/checks/ask.check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import { ANSWER_CHARS, PROMPT_CHARS, SYSTEM, buildAsk, parseOptions } from '../hooks/ask.ts'

// buildAsk: keeps the prompt's start and the answer's end, inside tags, and asks for a JSON array of 4
const ask = buildAsk('p'.repeat(PROMPT_CHARS + 50) + 'TAIL', 'HEAD' + 'a'.repeat(ANSWER_CHARS + 50))
assert.ok(ask.includes('<user_message>\n' + 'p'.repeat(PROMPT_CHARS) + '\n</user_message>'))
assert.ok(!ask.includes('TAIL'))
assert.ok(ask.includes('<agent_reply>\n' + 'a'.repeat(ANSWER_CHARS) + '\n</agent_reply>'))
assert.ok(!ask.includes('HEAD'))
assert.match(ask, /JSON array of exactly 4 strings/)
assert.ok(SYSTEM.length > 0)

// parseOptions
const four = ['run the checks', 'show the band', 'try the fork', 'commit it']
assert.deepEqual(parseOptions(JSON.stringify(four)), four)
assert.deepEqual(parseOptions('```json\n' + JSON.stringify(four) + '\n```'), four)
assert.deepEqual(parseOptions('Here you go: ' + JSON.stringify(four) + ' Hope it helps.'), four)
assert.deepEqual(parseOptions('{"a": 1}'), [])
assert.deepEqual(parseOptions('no json here'), [])
assert.deepEqual(parseOptions('[1] and [2]'), [])
assert.deepEqual(parseOptions(JSON.stringify([...four, 'fifth'])), four)
assert.deepEqual(parseOptions(JSON.stringify(['Run tests', 'run   TESTS', ' ', '', 7, null, 'ship'])), ['Run tests', 'ship'])
assert.deepEqual(parseOptions(JSON.stringify(['a\n  b'])), ['a b'])
const long = parseOptions(JSON.stringify(['x'.repeat(500)]))
assert.equal(long[0]?.length, 160)
console.log('followups: ok')
