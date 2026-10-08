// Self-check for the agent swimlanes. Run: node timeline/checks/lanes.check.ts
import assert from 'node:assert/strict'
import { buildLanes, lanesSvg, lanesText } from '../hooks/lanes.ts'

const now = Date.parse('2026-10-07T12:00:00Z')
const WINDOW = 15 * 60_000
const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString()
const agent = (id: string, type: string, state: string, minAgo: number, elapsedMs?: number) => ({
  kind: 'agent', at: at(minAgo), id, title: `agent ${id}`, depth: 1, type, model: 'sonnet',
  isPinned: true, isBackground: false, state, tools: 0, ...(elapsedMs !== undefined ? { elapsedMs } : {}),
})

const nodes = [
  agent('old', 'Explore', 'done', 40, 60_000), // ended 39 min ago: out of the window
  { kind: 'talk', at: at(30), title: 'User: go' },
  agent('long', 'Plan', 'done', 20, 10 * 60_000), // 20 → 10 min ago: overlaps
  agent('run', 'general-purpose', 'running', 7.5), // half the window, still running
  agent('fail', 'Explore', 'failed', 3, 30_000),
  agent('lost', 'Explore', 'unknown', 2),
] as never[]

const lanes = buildLanes(nodes, now, WINDOW, 8)
assert.deepEqual(lanes.map(l => l.label), ['Plan', 'general-purpose', 'Explore', 'Explore'])
assert.deepEqual(lanes[0], { label: 'Plan', start: now - 20 * 60_000, end: now - 10 * 60_000, state: 'done' })
assert.equal(lanes[1]?.end, now) // running: ends now
assert.equal(lanes[3]?.end, lanes[3]?.start) // no elapsed time: a zero-length run
assert.deepEqual(buildLanes(nodes, now, WINDOW, 2).map(l => l.state), ['failed', 'unknown']) // newest 2
assert.deepEqual(buildLanes(nodes, now + 60 * 60_000, WINDOW, 8).map(l => l.label), ['general-purpose']) // only the running one reaches a later window

const from = now - WINDOW
const text = lanesText(lanes, from, now, 30)
assert.equal(text.length, 4)
for (const line of text) assert.equal([...line].length, 9 + 1 + 30)
assert.ok(text[1]?.startsWith('general-p ')) // label cut to 9 cells
assert.ok(text[0]?.startsWith('Plan      ')) // label padded to 9 cells
const track = (line: string | undefined) => (line ?? '').slice(10)
assert.equal(track(text[1]).indexOf('▓'), 15) // the second half of the window starts at cell 15
assert.equal(track(text[1]).lastIndexOf('▓'), 29)
assert.equal(track(text[0]).indexOf('█'), 0) // started before the window: clipped to its start
assert.ok(track(text[2]).includes('▒'))
assert.ok(track(text[3]).includes('░')) // a zero-length run still shows one cell
assert.deepEqual(lanesText([], from, now, 30), [])

const svg = lanesSvg(lanes, from, now, 420)
assert.ok(svg.startsWith('<svg'))
assert.ok(svg.includes('width="420"'))
assert.equal(svg.split('<rect').length - 1, 4)
assert.ok(!svg.includes('<script'))
assert.ok(svg.length < 20_000)
assert.ok(lanesSvg([{ label: '<b>&"', start: from, end: now, state: 'done' }], from, now, 420).includes('&#60;b&#62;&#38;&#34;'))
assert.equal(lanesSvg([], from, now, 420), '')
console.log('lanes: ok')
