import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Rescue, Snapshot, Status, Worktree } from '../types'
import {
  MAX_PATHS,
  RISK_DAYS,
  SCAN,
  SUMMARY_SYSTEM,
  classify,
  cleanSummary,
  commitBody,
  count,
  isWorktreeCommand,
  parseStatusZ,
  planRescue,
  pushPrompt,
  remember,
  removePrompt,
  splitRoots,
} from './lib.ts'

const PANE = 'worktrees'
const TITLE = 'Worktrees'
// A full pass runs git status in every worktree (~20 s for ~200); events trigger extra passes.
const POLL_MS = 180_000
// The engine creates the worktree after classic.WorktreeCreate's chain; look a moment later.
const SETTLE_MS = 2_500
const SEEN_KEY = 'firstSeen'
const RISK_KEY = 'riskSeen'

const snapshotRef = { plugin: 'worktrees', key: 'snapshot' } as const
const riskOnlyRef = { plugin: 'worktrees', key: 'isRiskOnly' } as const
const scanningRef = { plugin: 'worktrees', key: 'isScanning' } as const
const selectedRef = { plugin: 'worktrees', key: 'selected' } as const
const rescueRef = { plugin: 'worktrees', key: 'rescue' } as const
const snapshotAtom = atom(snapshotRef, null as Snapshot | null)
const riskOnlyAtom = atom(riskOnlyRef, false)
const scanningAtom = atom(scanningRef, false)
const selectedAtom = atom(selectedRef, null as string | null)
const rescueAtom = atom(rescueRef, null as Rescue | null)

const GLYPH: Record<Status, string> = { risk: '!', work: '●', live: '·', safe: '✓', gone: '✕' }
const COLOR: Record<Status, 'error' | 'warning' | undefined> = { risk: 'error', work: 'warning', live: undefined, safe: undefined, gone: undefined }
const isQuiet = (status: Status): boolean => status === 'safe' || status === 'gone'

const lastLine = (text: string): string => text.trim().split('\n').pop() ?? ''
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// ---- Scan ----

// shortcut: a module variable, so a hot reload mid-scan can start a second one; harmless.
let inFlight: Promise<void> | undefined

const scan = ($: EngineInterface, options: PluginOptions): Promise<void> => {
  inFlight ??= runScan($, options).finally(() => (inFlight = undefined))
  return inFlight
}

const runScan = async ($: EngineInterface, options: PluginOptions): Promise<void> => {
  await update($, scanningAtom, () => true)
  try {
    const roots = splitRoots(options.roots)
    const staleDays = Number(options.staleDays) || 14
    const ran = await $.process.run(['sh', '-c', SCAN, 'sh', ...roots], { timeoutMs: 300_000 })
    const known = (await $.store.get(SEEN_KEY)) as Record<string, number> | undefined
    const first = classify(ran.stdout, known ?? {}, staleDays)
    const paths = first.repos.flatMap(repo => repo.worktrees.map(wt => wt.path))
    const { firstSeen, fresh } = remember(paths, known, first.now)
    await $.store.set(SEEN_KEY, firstSeen)

    const { now, repos } = classify(ran.stdout, firstSeen, staleDays)
    const error = ran.exitCode === 0 ? '' : lastLine(ran.stderr) || `scan exited ${ran.exitCode}`
    await update($, snapshotAtom, () => ({ now, repos, error }))

    const all = repos.flatMap(repo => repo.worktrees)
    const label = (wt: Worktree) => `${repos.find(repo => repo.path === wt.repo)?.name ?? '?'} / ${wt.name}`
    const risky = all.filter(wt => wt.status === 'risk')
    $.ui.status(risky.length ? `worktrees: ${risky.length} at risk` : undefined)

    // Toast a worktree once, when it turns at risk; the first pass only records.
    const seenRisk = (await $.store.get(RISK_KEY)) as string[] | undefined
    const turned = seenRisk ? risky.filter(wt => !seenRisk.includes(wt.path)) : []
    await $.store.set(RISK_KEY, risky.map(wt => wt.path))
    if (turned.length === 1 && turned[0]) {
      const wt = turned[0]
      $.ui.toast(`At risk: ${label(wt)}, ${wt.reason}. /worktrees to rescue.`, { timeoutMs: 10_000 })
    } else if (turned.length > 1) {
      $.ui.toast(`${turned.length} worktrees turned at risk. /worktrees to rescue.`, { timeoutMs: 10_000 })
    }

    const created = fresh.map(path => all.find(wt => wt.path === path)).filter(wt => wt !== undefined)
    if (created.length === 1 && created[0]) $.ui.toast(`New worktree: ${label(created[0])}`, { timeoutMs: 8_000 })
    else if (created.length > 1) $.ui.toast(`${created.length} new worktrees: ${created.slice(0, 3).map(label).join(', ')}`, { timeoutMs: 8_000 })
  } catch (error) {
    await update($, snapshotAtom, prev => ({ now: prev?.now ?? 0, repos: prev?.repos ?? [], error: message(error) }))
  } finally {
    await update($, scanningAtom, () => false)
  }
}

// ---- Rescue ----

const git = ($: EngineInterface, cwd: string, args: readonly string[]) =>
  $.process.run(['git', ...args], { cwd, timeoutMs: 60_000 })

// Every git step is the mod's own; the model only writes the commit subject and has no tools.
const rescueOne = async ($: EngineInterface, wt: Worktree): Promise<string> => {
  // A commit on a detached HEAD is unreachable once the folder goes.
  if (!wt.branch) return 'needs you: detached HEAD, create a branch first'

  const status = await git($, wt.path, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '-uall'])
  if (status.exitCode !== 0) return `needs you: git status failed: ${lastLine(status.stderr)}`
  const changes = parseStatusZ(status.stdout)

  const sizes: Record<string, number> = {}
  for (const change of changes.slice(0, MAX_PATHS + 1)) {
    if (change.isDeleted) continue
    const stat = await $.fs.stat(`${wt.path}/${change.path}`).catch(() => undefined)
    if (stat?.kind === 'file') sizes[change.path] = stat.size
  }

  const plan = planRescue(changes, sizes)
  if (plan.kind === 'needs-you') return `needs you: ${plan.why}`

  const add = await git($, wt.path, ['--literal-pathspecs', 'add', '-A', '--', ...plan.include])
  if (add.exitCode !== 0) return `needs you: git add failed: ${lastLine(add.stderr)}`

  const staged = (await git($, wt.path, ['diff', '--cached', '--name-only', '-z'])).stdout.split('\0').filter(Boolean)
  const leaked = staged.find(path => plan.skipped.some(one => one.path === path))
  if (leaked) return `needs you: ${leaked} is staged; nothing committed`
  if (!staged.length) return 'needs you: nothing to commit'

  const stat = await git($, wt.path, ['diff', '--cached', '--stat'])
  const patch = await git($, wt.path, ['diff', '--cached'])
  const fallback = `update ${staged.length} file${staged.length === 1 ? '' : 's'}`
  const answer = await $.model
    .complete({ model: 'haiku', system: SUMMARY_SYSTEM, prompt: `${stat.stdout}\n\n${patch.stdout.slice(0, 30_000)}`, timeoutMs: 30_000 })
    .catch(() => undefined)
  const summary = cleanSummary(answer?.isAnswered ? answer.text : undefined, fallback)

  const commit = await git($, wt.path, ['commit', '-m', `wip: ${summary}`, '-m', commitBody(staged.length, plan.skipped)])
  if (commit.exitCode !== 0) return `needs you: git commit failed: ${lastLine(commit.stderr || commit.stdout)}`
  const sha = (await git($, wt.path, ['rev-parse', '--short=7', 'HEAD'])).stdout.trim()

  return `committed ${sha}: wip: ${summary}`
}

const rescueQueue = async ($: EngineInterface, options: PluginOptions, repo: string, list: readonly Worktree[]) => {
  const running = (await $.state.get(rescueRef)).value
  if (running?.isRunning) {
    $.ui.toast(`A rescue of ${running.repo} is running; wait for it to end.`)
    return
  }
  await update($, rescueAtom, prev => ({ repo, total: list.length, done: 0, current: '', isRunning: true, results: prev?.results ?? {} }))

  let committed = 0
  for (const wt of list) {
    await update($, rescueAtom, prev => prev && { ...prev, current: wt.name })
    const result = await rescueOne($, wt).catch(error => `needs you: ${message(error)}`)
    if (result.startsWith('committed')) committed++
    await update($, rescueAtom, prev => prev && { ...prev, done: prev.done + 1, results: { ...prev.results, [wt.path]: result } })
  }

  await update($, rescueAtom, prev => prev && { ...prev, current: '', isRunning: false })
  await scan($, options)
  const left = list.length - committed
  $.ui.toast(`Rescued ${committed} of ${list.length} in ${repo}${left ? `; ${left} need you` : ''}.`, { timeoutMs: 10_000 })
}

const prune = async ($: EngineInterface, options: PluginOptions, repo: string) => {
  const ran = await $.process.run(['git', 'worktree', 'prune'], { cwd: repo })
  if (ran.exitCode !== 0) $.ui.toast(`git worktree prune failed: ${lastLine(ran.stderr)}`)
  await scan($, options)
}

// Unasked opens may be refused (narrow terminal, a hook); the pane just stays closed.
const openPane = ($: EngineInterface) => void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)

const ago = (now: number): string => {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - now) / 60))
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`
}

const nextStep = (wt: Worktree): string => {
  if (wt.status === 'risk') {
    return `Commit the ${wt.dirty} changed file${wt.dirty === 1 ? '' : 's'} as a WIP commit on ${wt.branch || 'this HEAD'}, so removing the folder cannot lose them. Nothing is pushed.`
  }
  if (wt.status === 'gone') return 'The folder is gone. Prune the leftover git record.'
  if (wt.status === 'safe') return `Safe to remove: clean, nothing only here (${wt.reason}).`
  if (wt.dirty) return wt.isMain ? 'Nothing. This is the main checkout.' : `Nothing yet. Used in the last ${RISK_DAYS} days.`
  if (wt.localOnly) return `${wt.localOnly} commit${wt.localOnly === 1 ? '' : 's'} exist only on this machine. Push if the branch matters.`
  return 'Nothing. In use.'
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'worktrees', description: 'Open the worktrees pane and rescan' })
    openPane($)
    void scan($, options)
    $.clock.every(POLL_MS, () => void scan($, options))

    return next(e)
  })

  on('command.run', { command: 'worktrees' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    $.clock.after(1, () => void scan($, options))

    return { text: 'Worktrees pane opened; rescanning.' }
  })

  // Creation hook: EnterWorktree, an isolated Agent and `claude --worktree` all raise it.
  // Observe only: the settings hooks beneath decide, and a failure here never blocks them.
  on('classic.WorktreeCreate', async ($, e, next) => {
    const done = await next(e)
    $.clock.after(SETTLE_MS, () => void scan($, options))
    return done
  }).catch(($, e, next) => next(e))

  on('classic.WorktreeRemove', async ($, e, next) => {
    const done = await next(e)
    $.clock.after(SETTLE_MS, () => void scan($, options))
    return done
  }).catch(($, e, next) => next(e))

  // `git worktree add` typed through Bash raises no hook of its own.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (isWorktreeCommand(e.command)) void scan($, options)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snapshot = await read($, snapshotAtom)
    const isRiskOnly = await read($, riskOnlyAtom)
    const isScanning = await read($, scanningAtom)
    const selected = await read($, selectedAtom)
    const rescue = await read($, rescueAtom)

    if (!snapshot) return <Text dimColor>Scanning repos for worktrees…</Text>

    const all = snapshot.repos.flatMap(repo => repo.worktrees)
    const risk = count(all, 'risk')
    const work = count(all, 'work')
    const safe = count(all, 'safe') + count(all, 'gone')
    const fresh = all.filter(wt => wt.isNew).length
    const repos = snapshot.repos
      .map(repo => ({ ...repo, worktrees: isRiskOnly ? repo.worktrees.filter(wt => wt.status === 'risk' || wt.isNew) : repo.worktrees }))
      .filter(repo => repo.worktrees.length > 0)

    // Kicked from a timer so the run outlives the press that started it.
    const startRescue = (repo: string, list: readonly Worktree[]) =>
      $.clock.after(1, () => void rescueQueue($, options, repo, list))

    const detail = (wt: Worktree, repoName: string) => {
      const result = rescue?.results[wt.path]
      const action =
        wt.status === 'risk' ? (
          <Button key={`rescue:${wt.path}`} variant="primary" onPress={() => startRescue(repoName, [wt])}>
            Rescue: commit as WIP
          </Button>
        ) : wt.status === 'gone' ? (
          <Button key={`prune:${wt.path}`} onPress={() => $.clock.after(1, () => void prune($, options, wt.repo))}>
            Prune record
          </Button>
        ) : wt.status === 'safe' ? (
          <Button key={`remove:${wt.path}`} onPress={() => $.prompt.fill({ text: removePrompt(wt), mode: 'replace' })}>
            Ask Claude to remove
          </Button>
        ) : wt.localOnly && !wt.dirty && wt.branch ? (
          <Button key={`push:${wt.path}`} onPress={() => $.prompt.fill({ text: pushPrompt(wt), mode: 'replace' })}>
            Ask Claude to push
          </Button>
        ) : null
      return (
        <Box key={`detail:${wt.path}`} flexDirection="column" marginLeft={2} marginBottom={1}>
          <Text dimColor wrap="truncate-start">{wt.path}</Text>
          <Text wrap="wrap">
            <Text dimColor>branch </Text>
            {wt.branch || 'detached HEAD'}
            <Text dimColor>
              {' · '}
              {wt.dirty} uncommitted · {wt.localOnly} local only · idle {wt.idleDays}d
            </Text>
          </Text>
          <Text wrap="wrap">
            <Text bold>Next: </Text>
            {nextStep(wt)}
          </Text>
          {result ? (
            <Text color={result.startsWith('committed') ? 'success' : 'warning'} wrap="wrap">
              Last rescue: {result}
            </Text>
          ) : null}
          {action}
        </Box>
      )
    }

    const row = (wt: Worktree, repoName: string) => {
      const color = COLOR[wt.status]
      const isOpen = selected === wt.path
      return [
        <Button key={wt.path} plain onPress={() => update($, selectedAtom, cur => (cur === wt.path ? null : wt.path))}>
          <Text color={color} dimColor={isQuiet(wt.status)} bold={wt.status === 'risk'}>
            {isOpen ? '▾' : GLYPH[wt.status]} {wt.name}
          </Text>
          {wt.isNew ? <Text color="suggestion" bold> new</Text> : null}
          <Text color={color} dimColor={!color}> {wt.reason}</Text>
        </Button>,
        isOpen ? detail(wt, repoName) : null,
      ]
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text wrap="wrap">
            <Text bold>{all.length} worktrees</Text>
            {risk ? <Text color="error" bold> · {risk} at risk</Text> : <Text color="success"> · none at risk</Text>}
            {work ? <Text color="warning"> · {work} holding work</Text> : null}
            {safe ? <Text dimColor> · {safe} safe to remove</Text> : null}
            {fresh ? <Text color="suggestion" bold> · {fresh} new</Text> : null}
          </Text>
          {rescue?.isRunning ? (
            <Text color="warning" wrap="truncate-end">
              Rescuing {rescue.repo} {rescue.done}/{rescue.total}
              {rescue.current ? ` · ${rescue.current}` : ''}
            </Text>
          ) : null}
          {snapshot.error ? (
            <Text color="error" wrap="wrap">Scan failed: {snapshot.error}</Text>
          ) : (
            <Text dimColor>{isScanning ? 'Scanning…' : `${snapshot.repos.length} repos · scanned ${ago(snapshot.now)}`}</Text>
          )}
          <Box flexDirection="row" columnGap={2}>
            <Button key="filter" hotkey="r" onPress={() => update($, riskOnlyAtom, value => !value)}>
              {isRiskOnly ? 'Show all' : 'Show at-risk only'}
            </Button>
            <Button key="rescan" hotkey="s" onPress={() => $.clock.after(1, () => void scan($, options))}>
              Rescan now
            </Button>
          </Box>
        </Box>

        {snapshot.repos.length === 0 && !snapshot.error ? (
          <Text dimColor wrap="wrap">No git repos found. Set the folders to scan under /config, worktrees, Roots.</Text>
        ) : null}
        {isRiskOnly && repos.length === 0 && snapshot.repos.length > 0 ? <Text color="success">No worktree is at risk.</Text> : null}

        {repos.map(repo => {
          const atRisk = repo.worktrees.filter(wt => wt.status === 'risk')
          return (
            <Box key={repo.path} flexDirection="column">
              <Box flexDirection="row" columnGap={1}>
                <Text wrap="truncate-end">
                  <Text bold>{repo.name}</Text>
                  <Text dimColor> {repo.worktrees.length}</Text>
                  {atRisk.length ? <Text color="error"> · {atRisk.length} at risk</Text> : null}
                </Text>
                {atRisk.length && !rescue?.isRunning ? (
                  <Button key={`rescue-repo:${repo.path}`} variant="primary" onPress={() => startRescue(repo.name, atRisk)}>
                    Rescue {atRisk.length}
                  </Button>
                ) : null}
              </Box>
              {repo.worktrees.flatMap(wt => row(wt, repo.name))}
            </Box>
          )
        })}
      </Box>
    )
  })
}
