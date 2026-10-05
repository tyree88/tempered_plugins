// Self-check for the pure logic. Run: node check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import { isPending, lastCd, segments, summarize } from './hooks/lib.ts'

assert.equal(lastCd('cd /a/b && git status', '/x'), '/a/b')
assert.equal(lastCd('git log; cd "/a b/c" && ls', '/x'), '/a b/c')
assert.equal(lastCd('cd work/app && pnpm test', '/T'), '/T/work/app')
assert.equal(lastCd('echo cd /nope', '/x'), undefined)
assert.equal(lastCd('cd ~/x && ls', '/x'), undefined)

// Real shape from a production repo's CI: duplicate names, a skipped run, a cancelled Sonar.
const runs = [
  { name: 'lint · test · build', status: 'completed', conclusion: 'skipped', started_at: '2026-10-03T19:02:00Z' },
  { name: 'migration drift (tree vs production)', status: 'completed', conclusion: 'success', started_at: '2026-10-03T19:02:00Z' },
  { name: 'SonarCloud Code Analysis', status: 'completed', conclusion: 'cancelled', started_at: '2026-10-03T19:01:00Z' },
  { name: 'migration drift (tree vs production)', status: 'completed', conclusion: 'success', started_at: '2026-10-03T19:00:00Z' },
  { name: 'lint · test · build', status: 'completed', conclusion: 'success', started_at: '2026-10-03T19:00:00Z' },
]
assert.deepEqual(summarize(runs, [{ context: 'Vercel', state: 'success' }]), { total: 4, pending: 0, failed: [] })
assert.deepEqual(
  summarize([{ name: 'ci', status: 'in_progress', conclusion: null }, { name: 'lint', status: 'completed', conclusion: 'failure' }], []),
  { total: 2, pending: 1, failed: ['lint'] },
)

const now = Date.parse('2026-10-04T20:00:00Z')
const snap = {
  dir: '/T/work/app/.worktrees/waitlist-journey',
  branch: 'feat/exciting-waitlist-journey',
  head: 'b8afa63aaaaaaaa',
  dirty: 3,
  ahead: 2,
  behind: 0,
  pr: { number: 312, state: 'OPEN' },
  ci: { sha: 'b8afa63aaaaaaaa', total: 5, pending: 1, failed: [] },
  prod: { sha: 'b8afa63aaaaaaaa', state: 'success', at: '2026-10-04T18:00:00Z' },
}
assert.equal(
  segments(snap, now).map(s => s.text).join('  ·  '),
  'waitlist-journey ⎇ feat/exciting-waitlist-journey  ·  3 dirty  ·  ↑2 ↓0  ·  PR #312  ·  CI ⏳ 4/5  ·  prod = HEAD ✓ 2h ago',
)
assert.equal(isPending(snap), true)
assert.equal(isPending({ ...snap, ci: { ...snap.ci, pending: 0 } }), false)
console.log('ship-state: ok')
