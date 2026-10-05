import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Snap } from '../types'
import { isPending, lastCd, segments, summarize } from './lib'

const snap = atom({ plugin: 'ship-state', key: 'snap' } as const, null)

const TICK = 20_000 // local git every tick; remote too while CI or a deploy is pending
const REMOTE_EVERY = 5 * 60_000
const WATCH = 10 * 60_000 // after a push/merge, poll remote fast for this long
const PUSH = /\bgit\s+push\b|\bgh\s+pr\s+(merge|create)\b|\bvercel\b.*--prod/
const TONE = { dim: undefined, ok: 'green', warn: 'yellow', bad: 'red' } as const

const parse = (text: string | undefined) => {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

export const register: Register = on => {
  let dir: string | undefined
  let cur: Snap | null = null
  let gh = 'gh'
  let remoteAt = 0
  let watchUntil = 0
  let isBusy = false
  const seen = { ciPending: '', prod: '' }

  const run = async ($: Engine, argv: string[], cwd?: string) => {
    try {
      const r = await $.process.run(argv, cwd ? { cwd, timeoutMs: 15_000 } : { timeoutMs: 15_000 })
      return r.exitCode === 0 ? r.stdout.trim() : undefined
    } catch {
      return undefined
    }
  }
  const toplevel = ($: Engine, path: string) => run($, ['git', '-C', path, 'rev-parse', '--show-toplevel'])

  const notify = ($: Engine, s: Snap) => {
    if (s.ci?.pending) seen.ciPending = s.ci.sha
    else if (s.ci && seen.ciPending === s.ci.sha) {
      seen.ciPending = ''
      const sha = s.ci.sha.slice(0, 7)
      $.ui.toast(s.ci.failed.length ? `CI ✗ ${s.ci.failed.join(', ')} @${sha}` : `CI ✓ all ${s.ci.total} green @${sha}`, {
        timeoutMs: 10_000,
      })
    }
    const key = s.prod ? `${s.prod.sha}:${s.prod.state}` : ''
    if (seen.prod && s.prod && key !== seen.prod) {
      const sha = s.prod.sha.slice(0, 7)
      if (s.prod.state === 'success') $.ui.toast(`Live on prod: ${sha}${s.prod.url ? ` → ${s.prod.url}` : ''}`, { timeoutMs: 15_000 })
      if (s.prod.state === 'failure' || s.prod.state === 'error') $.ui.toast(`Prod deploy ${s.prod.state}: ${sha}`, { timeoutMs: 15_000 })
    }
    seen.prod = key
  }

  const refresh = async ($: Engine, wantRemote: boolean) => {
    const d = dir // a `cd` can move `dir` mid-refresh; this snapshot stays on one repo
    if (isBusy || !d) return
    isBusy = true
    const git = (...args: string[]) => run($, ['git', ...args], d)
    const api = async (path: string) => parse(await run($, [gh, 'api', `repos/{owner}/{repo}/${path}`], d))
    try {
      const head = await git('rev-parse', 'HEAD')
      if (!head) {
        cur = null
        await update($, snap, () => null)
        return
      }
      const branch = (await git('symbolic-ref', '--short', '-q', 'HEAD')) ?? `detached ${head.slice(0, 7)}`
      const dirty = ((await git('status', '--porcelain')) ?? '').split('\n').filter(Boolean).length
      const counts = await git('rev-list', '--left-right', '--count', '@{u}...HEAD')
      const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null]
      const s: Snap = { ...(cur?.dir === d ? cur : {}), dir: d, branch, head, dirty, ahead, behind }

      const now = await $.clock.now()
      if (wantRemote || isPending(cur) || now < watchUntil || now - remoteAt > REMOTE_EVERY) {
        remoteAt = now
        const upstream = await git('rev-parse', '@{u}')
        const runs = upstream && (await api(`commits/${upstream}/check-runs?per_page=100`))
        const status = upstream && (await api(`commits/${upstream}/status`))
        s.ci = upstream && (runs || status)
          ? { sha: upstream, ...summarize(runs?.check_runs ?? [], status?.statuses ?? []) }
          : undefined
        s.pr = branch.startsWith('detached') ? undefined : parse(await run($, [gh, 'pr', 'view', '--json', 'number,state'], d))
        const dep = (await api('deployments?environment=Production&per_page=1'))?.[0]
        const last = dep && (await api(`deployments/${dep.id}/statuses?per_page=1`))?.[0]
        s.prod = dep
          ? { sha: dep.sha, state: last?.state ?? 'pending', url: last?.environment_url, at: last?.created_at ?? dep.created_at }
          : undefined
        notify($, s)
      }
      cur = s
      await update($, snap, () => s)
    } finally {
      isBusy = false
    }
  }

  on('session.start', async ($, e, next) => {
    dir = await toplevel($, await $.session.cwd())
    // The desktop app's PATH may lack Homebrew or /usr/local: try the usual install locations.
    for (const candidate of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']) {
      if (await run($, [candidate, '--version'], undefined)) {
        gh = candidate
        break
      }
    }
    void refresh($, true)
    $.clock.every(TICK, () => void refresh($, false))
    return next(e)
  })

  // Follow the repo Claude actually works in (it often `cd`s into a worktree), and watch after a push or merge.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId) return ran

    const target = lastCd(e.command, dir ?? (await $.session.cwd()))
    const top = target && (await toplevel($, target))
    if (top && top !== dir) {
      dir = top
      cur = null
      remoteAt = 0 // new repo: fetch its CI/prod now, not in 5 min
      seen.ciPending = seen.prod = ''
    }
    const isPushed = PUSH.test(e.command) && ran.deny === undefined && ran.isError !== true
    if (isPushed) watchUntil = (await $.clock.now()) + WATCH
    if (top || isPushed || /\b(git|gh)\b/.test(e.command)) void refresh($, isPushed)
    return ran
  })

  on('turn.complete', ($, e, next) => {
    if (!e.agentId) void refresh($, false)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    if (!s || e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    return (
      <Box flexDirection="row">
        {segments(s, now).map((seg, i) => (
          <Text key={String(i)} color={TONE[seg.tone]} dimColor={seg.tone === 'dim'} wrap="truncate">
            {i ? '  ·  ' : ''}
            {seg.text}
          </Text>
        ))}
      </Box>
    )
  })
}
