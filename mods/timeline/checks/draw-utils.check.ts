// Self-check for the pane's text helpers. Run: node timeline/checks/draw-utils.check.ts
import assert from 'node:assert/strict'
import { bar, elapsed, hhmm, tokens } from '../hooks/draw.ts'

assert.equal(bar(2, 4, 10), '█████░░░░░')
assert.equal(bar(0, 3, 6), '░░░░░░')
assert.equal(bar(9, 3, 4), '████')
assert.equal(bar(-5, 3, 4), '░░░░')
assert.equal(bar(1, 0, 3), '░░░')
assert.equal(bar(Number.NaN, 3, 4), '░░░░')
assert.equal(hhmm('2026-10-04T20:02:00.000Z', -300), '15:02')
assert.equal(hhmm('2026-10-04T23:30:00.000Z', 330), '05:00')
assert.equal(hhmm('not a date', 0), '--:--')
assert.equal(elapsed(192000), '3m12s')
assert.equal(elapsed(Number.NaN), '')
assert.equal(tokens(38000), '38k tokens')
assert.equal(tokens('abc' as never), '')
console.log('draw-utils: ok')
