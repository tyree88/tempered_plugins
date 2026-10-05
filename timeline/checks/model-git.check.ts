import assert from 'node:assert/strict'
import { ciFact, factsFromBash, lastCd, mainArg } from '../hooks/model.ts'

assert.equal(lastCd('cd /a/b && git status', '/x'), '/a/b')
assert.equal(lastCd('git log; cd "/a b/c" && ls', '/x'), '/a b/c')
assert.equal(lastCd('cd work/app && pnpm test', '/T'), '/T/work/app')
assert.equal(lastCd('echo cd /nope', '/x'), undefined)
assert.equal(lastCd('cd ~/x && ls', '/x'), undefined)
assert.equal(lastCd('cd /a\ncd /b && ls', '/x'), '/b')

const commit = (sha: string, subject: string) => ({ title: `commit ${sha} ${subject}`, fact: { type: 'commit', ref: sha } })
assert.deepEqual(factsFromBash('git add . && git commit -m "feat: lobby"', '[feat/court-lobby 9f3e1d2] feat: lobby\n 2 files changed'), [commit('9f3e1d2', 'feat: lobby')])
assert.deepEqual(factsFromBash('git -C /r commit -q -F -', '[main (root-commit) a581c30] Add mods'), [commit('a581c30', 'Add mods')])
assert.deepEqual(factsFromBash(`git commit -m "$(cat <<'EOF'\nfeat: x\nEOF\n)"`, 'pre-commit ok\n[main 1234567] feat: x'), [commit('1234567', 'feat: x')])
assert.deepEqual(factsFromBash('git -c user.name=x commit -m y', '[main abcdef1] y'), [commit('abcdef1', 'y')])
assert.deepEqual(factsFromBash('git commit -m a && git commit -m b', '[main 1111111] a\n[main 2222222] b'), [commit('1111111', 'a'), commit('2222222', 'b')])
assert.deepEqual(factsFromBash('echo git commit', '[main 1111111] a'), [])

assert.deepEqual(factsFromBash('git push -u origin feat/x', 'To github.com:t/g.git\n * [new branch]      feat/x -> feat/x\n'), [{ title: 'push feat/x', fact: { type: 'push', ref: 'feat/x' } }])
assert.deepEqual(factsFromBash('git push', 'To github.com:t/g.git\n   1a2b3c4..5d6e7f8  main -> main\n'), [{ title: 'push main', fact: { type: 'push', ref: 'main' } }])
assert.deepEqual(factsFromBash('git push', 'Everything up-to-date'), [])
assert.deepEqual(factsFromBash('git push', ' ! [rejected]        main -> main (fetch first)'), [])
assert.deepEqual(factsFromBash('git push origin --delete feat/old', ' - [deleted]         feat/old'), [])
assert.deepEqual(factsFromBash('grep -rn "git push" docs', 'docs/x.md:1: git push'), [])

assert.deepEqual(factsFromBash('gh pr create --fill', 'https://github.com/acme/app/pull/318\n'), [{ title: 'PR #318', fact: { type: 'pr', ref: '318', url: 'https://github.com/acme/app/pull/318' } }])
assert.deepEqual(factsFromBash('gh pr merge 250 --squash', ''), [{ title: 'merged PR #250', fact: { type: 'merge', ref: '250' } }])
assert.deepEqual(factsFromBash('gh pr merge --squash --delete-branch 250', ''), [{ title: 'merged PR #250', fact: { type: 'merge', ref: '250' } }])
assert.deepEqual(factsFromBash('gh pr merge 250 --auto --squash', ''), [])
assert.deepEqual(factsFromBash('echo "next: gh pr merge 12"', ''), [])
assert.deepEqual(factsFromBash('git status', 'On branch main'), [])

const pending = { dir: '/r', ci: { sha: 'abcdef1234', total: 5, pending: 2, failed: [] } }
const green = { dir: '/r', ci: { sha: 'abcdef1234', total: 5, pending: 0, failed: [] } }
const red = { dir: '/r', ci: { sha: 'abcdef1234', total: 5, pending: 0, failed: ['sonar'] } }
assert.deepEqual(ciFact(pending, green), { title: 'CI ✓ 5 @abcdef1', fact: { type: 'ci', ref: 'abcdef1234', state: 'success' } })
assert.deepEqual(ciFact(pending, red), { title: 'CI ✗ sonar @abcdef1', fact: { type: 'ci', ref: 'abcdef1234', state: 'failure' } })
assert.equal(ciFact(green, green), undefined)
assert.equal(ciFact(undefined, green), undefined)
assert.equal(ciFact(pending, { ci: 'junk' }), undefined)
assert.equal(ciFact({ dir: '/r', ci: { sha: 'zzz9999999', total: 5, pending: 2, failed: [] } }, green), undefined)
const many = { dir: '/r', ci: { sha: 'abcdef1234', total: 9, pending: 0, failed: Array.from({ length: 9 }, (_, i) => `check-number-${i}`) } }
assert.ok(ciFact(pending, many)!.title.length <= 80)

assert.equal(mainArg({ tool: 'Bash', tool_use_id: 't', command: 'pnpm test lobby' }), 'pnpm test lobby')
assert.equal(mainArg({ tool: 'Read', tool_use_id: 't', file_path: '/a/b.ts', limit: 5 }), '/a/b.ts')
assert.equal(mainArg({ tool: 'X', tool_use_id: 't' }), undefined)
assert.equal(mainArg({ tool: 'Bash', tool_use_id: 't', consent: 'The user pressed 1', agentId: 'a1', command: 'ls' }), 'ls')
console.log('model-git: ok')
