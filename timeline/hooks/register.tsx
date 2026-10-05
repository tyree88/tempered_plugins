import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Entry, LiveAgent, View } from '../types'
import { renderSvg, renderText } from './draw'
import { identify, openStore, run, type Repo, type Store } from './io'
import { buildNodes, paginate, summarize } from './layout'
import { ciFact, clip, factsFromBash, fromLog, lastCd, mainArg, mergeEntries, tzMinutes, type Found } from './model'

const view = atom({ plugin: 'timeline', key: 'view' } as const, null)

const PANE = 'timeline'
const TOOL = 'mcp__timeline__log'
const PAGE_SIZE = 40
const REFRESH_MS = 10_000
const TONE = { normal: undefined, dim: undefined, accent: 'blue', warn: 'yellow' } as const

const MAIN_NOTE =
  'Timeline: call `mcp__timeline__log` (1) once after a user message that sets or changes direction: kind "talk", title = one-line summary of what they asked or decided; (2) when you start a task, finish a step of it, finish it, or get blocked: kind "work", a stable kebab-case `task`, `done`/`total` steps, `status`, `how` (one line), `next` (one line). Never once per tool call; about one entry every few minutes of work. Do not mention the logging in replies.'
const AGENT_NOTE =
  '\n\nWhile you work, call `mcp__timeline__log` with kind "work" at start, after each step, and at the end, with `done`/`total`, `how`, and `next`. Keep each call short.'

const INPUT_SCHEMA = {
  type: 'object',
  required: ['kind', 'title'],
  properties: {
    kind: { enum: ['talk', 'work'] },
    title: { type: 'string' },
    task: { type: 'string' },
    done: { type: 'integer' },
    total: { type: 'integer' },
    status: { enum: ['active', 'done', 'blocked'] },
    how: { type: 'string' },
    next: { type: 'string' },
  },
}

export const register: Register = on => {
  let host: Engine | undefined
  let session = ''
  let home = ''
  let tz = 0
  let repo: Repo | undefined
  let store: Store | undefined
  let branch: string | undefined
  let seq = 0
  let page = 0
  let entries: Entry[] = []
  let bad = 0
  let activeTask: string | undefined
  let hasAutoOpened = false
  let hasWarnedWrite = false
  let useSection = true
  let lastNewest = ''
  let drawSeq = 0
  let ready: Promise<void> = Promise.resolve()
  const live: Record<string, LiveAgent> = {}

  const redraw = async ($: Engine) => {
    const mine = ++drawSeq
    const shown = paginate(buildNodes(entries, live, session, await $.clock.now()), page, PAGE_SIZE)
    page = shown.page
    // Animate the newest node only when it changed; every redraw reloads the drawing and would replay the fade.
    const newest = shown.nodes.at(-1)
    const key = newest ? `${newest.kind}|${newest.at}|${newest.title}` : ''
    const next: View = {
      header: summarize(entries, repo?.name ?? 'timeline', bad),
      nodes: shown.nodes,
      page: shown.page,
      pages: shown.pages,
      tz,
      fade: key !== lastNewest,
    }
    if (mine !== drawSeq) return // an older redraw that finishes late must not land last
    lastNewest = key
    // update retries on a version miss; by then a newer redraw may have started, so keep whatever is newer.
    await update($, view, prev => (mine === drawSeq ? next : prev))
    // Keep the live end in view: the engine owns the pane's scroll, and a long timeline starts at the top.
    if (next.fade && next.page === 0) void $.ui.scroll({ in: PANE, to: 'end' }).catch(() => {})
  }

  const reload = async ($: Engine) => {
    if (!store) return
    const all = await store.readAll()
    entries = all.entries
    bad = all.bad
    await redraw($)
  }

  const stamp = async ($: Engine, agentId?: string) => ({
    id: `${session.slice(0, 8)}-${++seq}`,
    at: new Date(await $.clock.now()).toISOString(),
    session,
    ...(branch ? { branch } : {}),
    ...(repo?.worktree ? { worktree: repo.worktree } : {}),
    ...(agentId ? { agentId } : {}),
  })

  const isShown = async ($: Engine) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown && p.isPlaced)

  const record = async ($: Engine, entry: Entry) => {
    if (!store) return 'timeline has no repo yet'
    const error = await store.append(entry)
    entries = mergeEntries([entries, [entry]])
    if (error && !hasWarnedWrite) {
      hasWarnedWrite = true
      $.ui.toast(`timeline: can't write ${store.dir}: ${error}`, { timeoutMs: 10_000 })
    }
    if (entry.kind === 'work' && !entry.agentId && !hasAutoOpened) {
      hasAutoOpened = true
      // Skip when the pane is already open. panes() lists only open panes, so one the person closed reopens once after a reload.
      if (!(await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: 'Timeline' }).catch(() => {})
    }
    await redraw($)
    return error
  }

  // Switch the timeline to the repo `path` is in. requireGit: ignore non-git folders (a `cd` into a scratch dir).
  const enterRepo = async ($: Engine, path: string, requireGit: boolean) => {
    const found = await identify($, path)
    if (requireGit && !found.isGit) return
    const newBranch = found.isGit ? await run($, ['git', '-C', path, 'symbolic-ref', '--short', '-q', 'HEAD']) : undefined
    if (repo?.root === found.root) {
      repo = found
      branch = newBranch ?? branch
      return
    }
    if (store) {
      await record($, { v: 1, ...(await stamp($)), kind: 'session', title: `session ${session.slice(0, 8)} left for ${found.name}`, event: 'close' })
    }
    repo = found
    branch = newBranch
    store = await openStore($, home, found.root, session)
    seq = store.lastSeq()
    entries = []
    page = 0
    activeTask = undefined
    await record($, { v: 1, ...(await stamp($)), kind: 'session', title: `session ${session.slice(0, 8)} opened`, event: 'open' })
    await reload($)
  }

  // /clear keeps the process but starts a new session id, with no session.start: follow it on the next prompt.
  const syncSession = async ($: Engine) => {
    const id = await $.session.id()
    if (!session || id === session || !repo) return
    // Open first, then switch id, store and seq together: no log may be stamped with the new id into the old store.
    const opened = await openStore($, home, repo.root, id)
    session = id
    store = opened
    seq = opened.lastSeq()
    hasAutoOpened = false
    activeTask = undefined
    await store.append({ v: 1, ...(await stamp($)), kind: 'session', title: `session ${session.slice(0, 8)} opened`, event: 'open' })
    await reload($)
  }

  on('session.start', async ($, e, next) => {
    host = $
    session = await $.session.id()
    home = (await $.env.get('HOME')) ?? ''
    tz = tzMinutes(await run($, ['date', '+%z']))
    try {
      useSection = (await $.prompt.compose()).sections.some(s => s.id === 'env_info_simple')
    } catch {
      useSection = false
    }
    await $.tool.register({
      name: 'log',
      description:
        'Record an entry on this repo\'s orchestration timeline. kind "talk": one-line summary of what the user asked or decided. kind "work": a task milestone with a stable kebab-case task id, done/total steps, status, how, and next.',
      inputSchema: INPUT_SCHEMA,
    })
    await $.command.register({ name: 'timeline', description: 'Show or hide the orchestration timeline pane' })
    // Not awaited: reading a big repo timeline must not delay the session's first prompt. Hooks await `ready`.
    ready = $.session.cwd().then(cwd => enterRepo($, cwd, false)).catch(() => {})
    $.clock.every(REFRESH_MS, () => {
      void (async () => {
        if (host && (await isShown(host))) await reload(host)
      })().catch(() => {})
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await ready
    // append, not record: the session.end chain shares one short wall-clock bound, so no redraw here.
    if (store) await store.append({ v: 1, ...(await stamp($)), kind: 'session', title: `session ${session.slice(0, 8)} closed`, event: 'close' })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Only a /clear changes the id; otherwise the first prompt must not wait for the initial timeline read.
    if ((await $.session.id()) !== session) {
      await ready
      await syncSession($)
    }
    return next(e)
  })

  // The log only appends to a local file: no permission prompt.
  on('tool.check', { tool: TOOL }, () => ({ decision: 'allow' as const, reason: 'timeline log only appends to a local file' }))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    await ready
    const entry = fromLog(e as unknown as Record<string, unknown>, await stamp($, e.agentId))
    if ('error' in entry) return { deny: entry.error }
    // The talk side is the user's asks and decisions; a subagent that also got the main note must not write there.
    if (entry.kind === 'talk' && entry.agentId) return { result: 'logged' }
    if (entry.kind === 'work' && !entry.agentId) {
      if (entry.status === 'active') activeTask = entry.task
      else if (activeTask === entry.task) activeTask = undefined
    }
    const error = await record($, entry)
    return { result: error ? `logged, not saved: ${error}` : 'logged' }
  })

  on('prompt.section', { name: 'env_info_simple' }, async ($, e, next) => {
    const r = await next(e)
    if (!useSection) return r // the note goes through prompt.context instead
    return { text: `${r.text ?? ''}\n\n${MAIN_NOTE}`.trim() }
  })

  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    return useSection ? r : { ...r, blocks: [...r.blocks, { name: 'timeline', text: MAIN_NOTE }] }
  })

  on('command.run', { command: 'timeline' }, async $ => {
    await ready
    if (await isShown($)) {
      await $.ui.close({ id: PANE })
      return { text: 'Timeline closed.' }
    }
    await reload($)
    await $.ui.open({ id: PANE, title: 'Timeline' })
    return { text: 'Timeline opened.' }
  })

  let lastSnap: unknown
  let bookkeeping: Promise<void> = Promise.resolve() // Bash bookkeeping runs one call at a time, in call order

  const here = () =>
    repo ? (repo.worktree?.startsWith('/') ? repo.worktree : repo.worktree ? `${repo.root}/${repo.worktree}` : repo.root) : undefined

  const refreshBranch = async ($: Engine) => {
    const dir = here()
    if (dir) branch = (await run($, ['git', '-C', dir, 'symbolic-ref', '--short', '-q', 'HEAD'])) ?? branch
  }

  const recordFact = async ($: Engine, found: Found) =>
    record($, {
      v: 1,
      ...(await stamp($)),
      kind: 'fact',
      title: found.title,
      fact: found.fact,
      ...(activeTask ? { attachTo: activeTask } : {}),
    })

  // Bash: commit/push/PR facts from any loop (subagents make most commits in orchestration work); the main loop also
  // follows `cd` into another repo. The bookkeeping runs after the result is returned, one call at a time, so the model never waits on it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const base = await $.session.cwd() // before the command runs: a `cd` may move the session's cwd
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const command = String(e.command)
    const output = ran.text ?? ''
    const isError = ran.isError === true
    bookkeeping = bookkeeping.then(async () => {
      await ready
      const target = lastCd(command, base)
      if (!e.agentId && target) await enterRepo($, target, true)
      if (!repo) return
      // A subagent working in another repo: its facts belong to that repo's timeline, not this one.
      if (e.agentId && target) {
        const there = await identify($, target)
        if (there.isGit && there.root !== repo.root) return
      }
      if (/\bgit\b/.test(command)) await refreshBranch($)
      // A failed call can still have committed or pushed (`git commit && git push && gh …` failing late). PR and merge
      // facts need success: `gh pr create` exits 1 when a PR exists and prints that PR's URL.
      for (const found of factsFromBash(command, output)) {
        if (isError && found.fact.type !== 'commit' && found.fact.type !== 'push') continue
        await recordFact($, found)
      }
    }).catch(() => {})
    return ran
  })

  // A subagent's own tool calls feed its live card (`now:` and the tool count), not the file.
  on('tool.call', async ($, e, next) => {
    const agent = e.agentId ? live[e.agentId] : undefined
    if (agent && e.tool !== TOOL) {
      agent.tools += 1
      agent.now = `${e.tool} ${clip(mainArg(e as unknown as Record<string, unknown>), 40) ?? ''}`.trim()
      void redraw($).catch(() => {})
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    // Only the model's own Agent calls get the logging note; another plugin's spawn may expect its prompt untouched.
    const isModelCall = next.origin.plugin === 'engine'
    const result = await next(!e.fork && isModelCall ? { ...e, prompt: `${e.prompt}${AGENT_NOTE}` } : e)
    if (result.deny !== undefined || !result.agentId) return result
    await ready
    live[result.agentId] = { tools: 0, startedAt: await $.clock.now() }
    const prompt = clip(e.prompt, 2000)
    await record($, {
      v: 1,
      ...(await stamp($)),
      kind: 'agent',
      title: clip(e.description, 80) ?? e.subagentType,
      agent: {
        id: result.agentId,
        phase: 'start',
        type: e.subagentType,
        model: result.model,
        isPinned: !e.fork && (!!e.model || result.model !== e.parentModel), // set on the call or by the agent's own definition; a fork inherits
        isBackground: e.background,
        ...(e.parentAgentId ? { parentAgentId: e.parentAgentId } : {}),
        ...(activeTask ? { parentTask: activeTask } : {}),
        ...(prompt ? { prompt } : {}),
      },
    })
    return result
  })

  // A subagent's turn ended: freeze its card. An agent continued later can end more than once.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) return result
    await ready
    // Engine forks and other plugins' agents carry agent ids too: only end agents this timeline started.
    if (!(e.agentId in live) && !entries.some(x => x.kind === 'agent' && x.agent?.id === e.agentId)) return result
    const agent = live[e.agentId]
    delete live[e.agentId]
    const summary = clip(e.answer.split('\n').find(line => line.trim()) ?? '', 160)
    const u = e.usage
    // Cached input counts too: with prompt caching, uncached input alone is a small fraction of what the agent read.
    const tokens = u
      ? u.input_tokens + u.output_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      : undefined
    await record($, {
      v: 1,
      ...(await stamp($)),
      kind: 'agent',
      title: 'agent end',
      agent: {
        id: e.agentId,
        phase: 'end',
        status: e.reason === 'answer' ? 'done' : 'failed', // aborted, refused or an API error
        durationMs: e.durationMs,
        ...(agent ? { tools: agent.tools } : {}),
        ...(tokens !== undefined ? { tokens } : {}),
        ...(summary ? { result: summary } : {}),
      },
    })
    return result
  })

  // ship-state's snapshot for this repo went from pending CI to a result: add a CI fact.
  on('state.set', { plugin: 'ship-state', key: 'snap' }, async ($, e, next) => {
    const result = await next(e)
    await ready
    const dir = (e.value as { dir?: unknown } | null | undefined)?.dir
    const isThisRepo =
      !!repo && typeof dir === 'string' && (dir === here() || dir === repo.root || dir.startsWith(`${repo.root}/`))
    const found = isThisRepo ? ciFact(e.previous ?? lastSnap, e.value) : undefined
    lastSnap = e.value
    if (found) await recordFact($, found)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    if (!v) return <Text dimColor>Timeline loading…</Text>

    const turn = (delta: number) => async () => {
      page = Math.max(0, page + delta)
      await redraw($)
    }
    const head = (
      <Box flexDirection="row">
        <Text bold>{v.header} </Text>
        {v.page < v.pages - 1 && <Button key="older" label="◀ older" onPress={turn(1)} />}
        {v.page > 0 && <Button key="newer" label="newer ▶" onPress={turn(-1)} />}
      </Box>
    )

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const alt = `${v.header}. ${v.nodes.length} entries shown; newest: ${v.nodes.at(-1)?.title ?? 'none'}.`
      return (
        <Box flexDirection="column">
          {head}
          <Svg source={renderSvg(v.nodes, v.tz, { fade: v.fade })} alt={alt} isInteractive />
        </Box>
      )
    }

    // bodyColumns is the pane's own width (a docked pane is narrower than the screen viewport).
    const lines = renderText(v.nodes, e.props.bodyColumns, v.tz)
    return (
      <Box flexDirection="column">
        {head}
        {lines.map((line, i) => (
          <Text key={String(i)} color={TONE[line.tone]} dimColor={line.tone === 'dim'} wrap="truncate">
            {line.text}
          </Text>
        ))}
      </Box>
    )
  })
}
