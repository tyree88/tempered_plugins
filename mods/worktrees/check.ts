// Self-check for the pure logic. Run: node check.ts  (Node 23+ strips types)
import assert from 'node:assert/strict'
import {
  classify,
  cleanSummary,
  commitBody,
  isSecretLike,
  isWorktreeCommand,
  parseStatusZ,
  planRescue,
  remember,
  removePrompt,
  splitRoots,
} from './hooks/lib.ts'

const DAY = 86_400
const now = 1_800_000_000
const ago = (days: number) => String(now - days * DAY)
const lines = (...rows: string[][]) => rows.map(row => row.join('\t')).join('\n')
const wt = (path: string, branch: string, ...extra: string[]) => [
  ['P', `worktree ${path}`],
  ['P', 'HEAD a'],
  ['P', branch ? `branch refs/heads/${branch}` : 'detached'],
  ...extra.map(line => ['P', line]),
  ['P', ''],
]

// One repo with a remote, one worktree per row of the status ladder.
const scan = lines(
  ['N', String(now)],
  ['R', '/w/app', 'main', 'origin'],
  ...wt('/w/app', 'main'),
  ...wt('/w/app/.wt/risky', 'risky'),
  ...wt('/w/app/.wt/busy', 'busy'),
  ...wt('/w/app/.wt/local', 'local'),
  ...wt('/w/app/.wt/done', 'done'),
  ...wt('/w/app/.wt/gone', 'gone'),
  ...wt('/w/app/.wt/old', 'old'),
  ...wt('/w/app/.wt/fresh', 'fresh'),
  ...wt('/w/app/.wt/lost', 'lost', 'prunable gitdir file points to non-existent location'),
  ['B', 'main', ago(40), '[gone]'],
  ['B', 'risky', ago(41), ''],
  ['B', 'busy', ago(30), ''],
  ['B', 'local', ago(60), '[ahead 2]'],
  ['B', 'done', ago(5), ''],
  ['B', 'gone', ago(1), '[gone]'],
  ['B', 'old', ago(20), ''],
  ['B', 'fresh', ago(30), ''],
  ['B', 'lost', ago(0), ''],
  ['M', 'main'], ['M', 'fresh'], ['M', 'done'],
  ['A', '/w/app/.wt/fresh', String(now - 60)],
  ['S', '/w/app', '3', ago(50), '0'],
  ['S', '/w/app/.wt/risky', '4', ago(41), '0'],
  ['S', '/w/app/.wt/busy', '2', ago(1), '0'],
  ['S', '/w/app/.wt/local', '0', '0', '2'],
  ['S', '/w/app/.wt/done', '0', '0', '0'],
  ['S', '/w/app/.wt/gone', '0', '0', '0'],
  ['S', '/w/app/.wt/old', '0', '0', '0'],
  ['S', '/w/app/.wt/fresh', '0', '0', '0'],
  ['R', '/w/empty', '', ''],
)

const { repos } = classify(scan, { '/w/app/.wt/fresh': now - 60 }, 14)
const byName = Object.fromEntries(repos[0]!.worktrees.map(one => [one.name, one]))
const verdict = (name: string) => `${byName[name]!.status} ${byName[name]!.reason}`

assert.equal(repos.length, 1, 'a repo with no worktrees is dropped')
assert.equal(verdict('risky'), 'risk 4 uncommitted · 41d idle')
assert.equal(verdict('busy'), 'work 2 uncommitted', 'dirty but touched yesterday is not at risk')
assert.equal(verdict('app'), 'work 3 uncommitted', 'the main checkout is never at risk: it cannot be removed')
assert.equal(verdict('local'), 'work 2 local only', 'committed work survives removal, so it is not red')
assert.equal(verdict('done'), 'safe in main')
assert.equal(verdict('gone'), 'safe upstream gone')
assert.equal(verdict('old'), 'safe idle 20d')
assert.equal(verdict('fresh'), 'live today', 'a branch at main tip touched a minute ago is not "in main"')
assert.equal(byName.fresh!.isNew, true)
assert.equal(verdict('lost'), 'gone folder missing')
assert.deepEqual(
  repos[0]!.worktrees.map(one => one.name),
  ['risky', 'fresh', 'local', 'app', 'busy', 'old', 'done', 'gone', 'lost'],
  'risk, then new, then work, live, safe, gone; longest idle first within each',
)

// No remote: nothing is "local only".
const noRemote = lines(['N', String(now)], ['R', '/w/solo', 'main', ''], ...wt('/w/solo', 'main'), ['S', '/w/solo', '0', '0', '0'])
assert.equal(classify(noRemote, {}, 14).repos[0]!.worktrees[0]!.status, 'live')

// Duplicate folder names get their parent folder.
const dupes = lines(['N', String(now)], ['R', '/w/a', 'main', 'origin'], ...wt('/w/a', 'main'), ...wt('/w/x/a', 'b'))
assert.deepEqual(classify(dupes, {}, 14).repos[0]!.worktrees.map(one => one.name).sort(), ['w/a', 'x/a'])

// Seed scan stamps nothing as new; a later scan stamps only unknown paths.
assert.deepEqual(remember(['/a', '/b'], undefined, now), { firstSeen: { '/a': 0, '/b': 0 }, fresh: [] })
assert.deepEqual(remember(['/a', '/c'], { '/a': 0, '/b': 0 }, now), { firstSeen: { '/a': 0, '/c': now }, fresh: ['/c'] })

assert.deepEqual(splitRoots(''), ['.'])
assert.deepEqual(splitRoots(' ~/code , /srv/repos '), ['~/code', '/srv/repos'])

assert.equal(isWorktreeCommand('git worktree add ../x -b x'), true)
assert.equal(isWorktreeCommand('cd app && git -C . worktree remove ../x'), true)
assert.equal(isWorktreeCommand('git worktree list'), false)
assert.equal(isWorktreeCommand('echo worktree add; git status'), false)

// ---- Rescue ----

const status = [' M src/app.ts', '?? notes/my file.md', 'R  new.ts', 'old.ts', ' D gone.ts', 'A  .env', ''].join('\0')
assert.deepEqual(parseStatusZ(status), [
  { path: 'src/app.ts', isStaged: false, isDeleted: false },
  { path: 'notes/my file.md', isStaged: false, isDeleted: false },
  { path: 'new.ts', isStaged: true, isDeleted: false },
  { path: 'gone.ts', isStaged: false, isDeleted: true },
  { path: '.env', isStaged: true, isDeleted: false },
])

for (const path of ['.env', 'app/.env.local', 'certs/server.pem', 'k.key', 'id_rsa', 'id_ed25519.pub', 'credentials.json', 'service-account-prod.json', '.npmrc', 'my-secret.txt', 'x.p12']) {
  assert.equal(isSecretLike(path), true, `${path} is secret-like`)
}
for (const path of ['.env.example', '.env.sample', 'src/env.ts', 'keyboard.ts', 'README.md', 'monkey.json']) {
  assert.equal(isSecretLike(path), false, `${path} is not secret-like`)
}

const big = 6 * 1024 * 1024
const change = (path: string, extra: Partial<{ isStaged: boolean; isDeleted: boolean }> = {}) => ({ path, isStaged: false, isDeleted: false, ...extra })
assert.deepEqual(planRescue([change('a.ts'), change('.env'), change('video.mp4'), change('old.bin', { isDeleted: true })], { 'video.mp4': big, 'old.bin': big }), {
  kind: 'commit',
  include: ['a.ts', 'old.bin'],
  skipped: [{ path: '.env', why: 'secret-like' }, { path: 'video.mp4', why: 'over 5 MB' }],
})
assert.equal(planRescue([change('.env', { isStaged: true }), change('a.ts')], {}).kind, 'needs-you', 'a staged secret stops the run')
assert.equal(planRescue([change('.env')], {}).kind, 'needs-you', 'nothing left to include')
assert.equal(planRescue(Array.from({ length: 201 }, (_, i) => change(`f${i}`)), {}).kind, 'needs-you', 'over 200 paths')

assert.equal(cleanSummary('"wip: Add retry to Stripe webhook"\nmore text', 'x'), 'Add retry to Stripe webhook')
assert.equal(cleanSummary('   ', 'update 3 files'), 'update 3 files')
assert.equal(cleanSummary(undefined, 'update 3 files'), 'update 3 files')
assert.equal(cleanSummary('a'.repeat(100), 'x').length, 65)
assert.equal(commitBody(1, []), 'Rescued by the worktrees mod before cleanup. 1 file.')
assert.equal(
  commitBody(3, [{ path: '.env', why: 'secret-like' }]),
  'Rescued by the worktrees mod before cleanup. 3 files. Skipped: .env (secret-like).',
)
assert.match(removePrompt({ path: '/w/x', branch: 'b' }), /git worktree remove \/w\/x` \(no --force\).*git branch -d b/)

console.log('check.ts: ok')
