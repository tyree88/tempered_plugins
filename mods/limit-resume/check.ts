// Self-check for the pure logic. Run: node check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import { classify, delayMs, fmt } from './hooks/register.ts'

const MIN = 60_000
const now = Date.parse('2026-10-04T20:00:00Z')
const at = (ms: number) => new Date(now + ms).toISOString()

assert.equal(classify('error', "You've hit your session limit · resets 11:50pm (America/Chicago)", []), 'limit')
assert.equal(classify('answer', "You've hit your weekly limit · resets 8am (America/Chicago)", []), 'limit')
assert.equal(classify('error', 'API Error: 529 Overloaded. This is a server-side issue', []), 'transient')
assert.equal(classify('error', 'API Error: Your computer went to sleep mid-response.', []), 'transient')
assert.equal(classify('error', 'Prompt is too long', []), 'fatal')
assert.equal(classify('error', '', [{ kind: 'five_hour', percentUsed: 100, resetsAt: at(MIN) }]), 'limit')
assert.equal(classify('answer', 'Pushed to develop. Watch the rate limit on the API route.', []), null)

assert.equal(delayMs('transient', 0, [], now), MIN)
assert.equal(delayMs('transient', 9, [], now), 15 * MIN)
const fiveOver = { kind: 'five_hour', percentUsed: 100, resetsAt: at(120 * MIN) }
const weekOk = { kind: 'seven_day', percentUsed: 40, resetsAt: at(3 * 1440 * MIN) }
const weekOver = { kind: 'seven_day', percentUsed: 100, resetsAt: at(1440 * MIN) }
assert.equal(delayMs('limit', 0, [fiveOver, weekOk], now), 121 * MIN)
assert.equal(delayMs('limit', 0, [fiveOver, weekOver], now), 1441 * MIN)
assert.equal(delayMs('limit', 0, [{ ...fiveOver, percentUsed: 97 }, weekOk], now), 121 * MIN)
assert.equal(delayMs('limit', 0, [], now), 30 * MIN)

assert.equal(fmt(192 * MIN), '3h12m')
assert.equal(fmt(5 * MIN), '5m')
console.log('limit-resume: ok')
