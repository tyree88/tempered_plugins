import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Entry, LiveAgent, Task, View } from '../types'
import { buildNodes, buildPanel } from './layout'
import { ciFact, clip, factsFromBash, folderName, fromLog, lastCd, mainArg, mergeEntries, parseJsonl, repoRoot, toJsonl, tzMinutes, type Found } from './model'
import { drawPane } from './pane'
import { parsePlan, type Plan } from './plan'
import { applyTaskCall, createdId, fromTaskList } from './tasks'

const view = atom({ plugin: 'timeline', key: 'view' } as const, null)
const tasks = atom({ plugin: 'timeline', key: 'tasks' } as const, [] as Task[])

const PANE = 'timeline'
const TOOL = 'mcp__timeline__log'
const PAGE_SIZE = 30
const REFRESH_MS = 10_000
const TASK_TOOLS = ['TaskCreate', 'TaskUpdate', 'TodoWrite', 'TaskList'] as const
const DOC_TOOLS = ['Read', 'Write', 'Edit'] as const
const PLAN_MAX_BYTES = 262_144 // a bigger .md is not read for plan detection
const AUTO_OPEN_TASKS = 3 // open tasks that make the pane worth opening

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

// A host command's trimmed stdout, or undefined on a non-zero exit or a spawn failure.
async function run($: Engine, argv: string[], cwd?: string): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, cwd ? { cwd, timeoutMs: 10_000 } : { timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

type Repo = { root: string; name: string; isGit: boolean; worktree?: string }

// The repo a path belongs to; worktrees share their main checkout's root. A non-git path is its own identity.
// One rev-parse call. Git older than 2.31 echoes the unknown --path-format flag, so a non-absolute line means "not git".
async function identify($: Engine, path: string): Promise<Repo> {
  const out = await run($, ['git', '-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'])
  const [common, top] = out?.split('\n') ?? []
  if (!common?.startsWith('/') || !top?.startsWith('/')) {
    return { root: path, name: path.split('/').filter(Boolean).at(-1) ?? path, isGit: false }
  }
  const root = repoRoot(common)
  const name = root.split('/').filter(Boolean).at(-1) ?? root
  if (top === root) return { root, name, isGit: true }
  return { root, name, isGit: true, worktree: top.startsWith(`${root}/`) ? top.slice(root.length + 1) : top }
}

type Store = {
  dir: string
  lastSeq: () => number
  append: (entry: Entry) => Promise<string | undefined>
  readAll: () => Promise<{ entries: Entry[]; bad: number }>
}

type Listed = { name: string; kind: string; mtimeMs: number; size: number }

const PART_CHARS = 1_048_576 // start a new part file past 1 MiB of text; $.fs reads and writes cap at 4 MiB

const seqOf = (entries: readonly Entry[]) => entries.reduce((max, e) => Math.max(max, Number(e.id.split('-').at(-1)) || 0), 0)

// One repo's timeline folder. This session rewrites only its current part file (`<session>.jsonl`, then
// `<session>-1.jsonl`, …). Every other file, this session's earlier parts included, is read and cached by mtime and size.
// A part that can't be read or has unreadable lines is never rewritten: writing continues in a new part.
async function openStore($: Engine, home: string, root: string, session: string): Promise<Store> {
  const dir = `${home}/.claude/timelines/${folderName(root)}`
  const partName = (n: number) => (n ? `${session}-${n}.jsonl` : `${session}.jsonl`)
  const partIndex = (name: string) => {
    if (name === `${session}.jsonl`) return 0
    const m = name.match(/^(.+)-(\d+)\.jsonl$/)
    return m && m[1] === session ? Number(m[2]) : -1
  }
  const cache = new Map<string, { mtimeMs: number; size: number; entries: Entry[]; bad: number }>()
  let part = 0
  let own: Entry[] = []
  let saved = 0 // how many entries of `own` are on disk

  const list = async (): Promise<readonly Listed[] | undefined> => {
    try {
      return await $.fs.list(dir)
    } catch {
      return undefined // no folder yet
    }
  }

  const parts = ((await list()) ?? []).filter(f => f.kind === 'file').map(f => partIndex(f.name)).filter(n => n >= 0)
  if (parts.length) {
    part = Math.max(...parts)
    try {
      const parsed = parseJsonl(await $.fs.read(`${dir}/${partName(part)}`))
      if (parsed.bad) part += 1
      else {
        own = parsed.entries
        saved = own.length
      }
    } catch {
      part += 1 // over 4 MiB or unreadable: leave it alone
    }
  }

  const readAll = async () => {
    const listed = await list()
    if (!listed) return { entries: [...own], bad: 0 }
    const current = partName(part)
    for (const name of [...cache.keys()]) if (!listed.some(f => f.name === name)) cache.delete(name)
    for (const file of listed) {
      if (file.kind !== 'file' || !file.name.endsWith('.jsonl') || file.name === current) continue
      const hit = cache.get(file.name)
      if (hit && hit.mtimeMs === file.mtimeMs && hit.size === file.size) continue
      try {
        cache.set(file.name, { mtimeMs: file.mtimeMs, size: file.size, ...parseJsonl(await $.fs.read(`${dir}/${file.name}`)) })
      } catch {
        cache.delete(file.name)
      }
    }
    const others = [...cache.values()]
    return { entries: mergeEntries([own, ...others.map(c => c.entries)]), bad: others.reduce((n, c) => n + c.bad, 0) }
  }

  const write = async (entry: Entry): Promise<string | undefined> => {
    own = [...own, entry]
    let text = toJsonl(own)
    if (text.length > PART_CHARS && saved > 0) {
      // This part is full; what is saved stays there. Entries not yet on disk move to the next part.
      part += 1
      own = own.slice(saved)
      saved = 0
      text = toJsonl(own)
    }
    try {
      await $.fs.write(`${dir}/${partName(part)}`, text)
      saved = own.length
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  // One write at a time: parallel subagents logging together must not let an older whole-file write land last.
  let chain: Promise<unknown> = Promise.resolve()
  const append = (entry: Entry): Promise<string | undefined> => {
    const next = chain.then(() => write(entry))
    chain = next
    return next
  }

  // Highest id suffix across all of this session's parts, so a new id never repeats one.
  const lastSeq = () =>
    Math.max(seqOf(own), ...[...cache].filter(([name]) => partIndex(name) >= 0).map(([, c]) => seqOf(c.entries)))

  await readAll()
  return { dir, lastSeq, append, readAll }
}

// Shared by the hooks and the top-level helpers below: the loader lets $ reach only functions declared at the top of this file.
const st = {
  session: '',
  home: '',
  tz: 0,
  repo: undefined as Repo | undefined,
  store: undefined as Store | undefined,
  branch: undefined as string | undefined,
  seq: 0,
  page: 0,
  entries: [] as Entry[],
  bad: 0,
  activeTask: undefined as string | undefined,
  hasAutoOpened: false,
  hasWarnedWrite: false,
  drawSeq: 0,
  live: {} as Record<string, LiveAgent>,
  planPath: undefined as string | undefined,
  plan: undefined as { path: string; mtime: number; parsed: Plan | null } | undefined,
  notPlan: new Map<string, number>(), // .md path → the mtime at which it was read and was not a plan
  taskSeq: 0,
}

// The active plan, re-parsed only when its file changed. A missing or unreadable file clears it.
async function loadPlan($: Engine): Promise<Plan | null> {
  const path = st.planPath
  if (!path) return null
  try {
    const { mtimeMs } = await $.fs.stat(path)
    if (st.plan?.path !== path || st.plan.mtime !== mtimeMs) {
      st.plan = { path, mtime: mtimeMs, parsed: parsePlan(await $.fs.read(path)) }
    }
    return st.plan.parsed
  } catch {
    st.planPath = undefined
    st.plan = undefined
    return null
  }
}

const redraw = async ($: Engine) => {
  const mine = ++st.drawSeq
  const now = await $.clock.now()
  const nodes = buildNodes(st.entries, st.live, st.session, now)
  const panel = buildPanel(nodes, await read($, tasks), await loadPlan($), st.page, PAGE_SIZE, now)
  st.page = panel.page
  const next: View = { repo: st.repo?.name ?? 'timeline', ...(st.branch ? { branch: st.branch } : {}), bad: st.bad, tz: st.tz, panel }
  if (mine !== st.drawSeq) return // an older redraw that finishes late must not land last
  // update retries on a version miss; by then a newer redraw may have started, so keep whatever is newer.
  await update($, view, prev => (mine === st.drawSeq ? next : prev))
}

const reload = async ($: Engine) => {
  if (!st.store) return
  const all = await st.store.readAll()
  st.entries = all.entries
  st.bad = all.bad
  await redraw($)
}

const stamp = async ($: Engine, agentId?: string) => ({
  id: `${st.session.slice(0, 8)}-${++st.seq}`,
  at: new Date(await $.clock.now()).toISOString(),
  session: st.session,
  ...(st.branch ? { branch: st.branch } : {}),
  ...(st.repo?.worktree ? { worktree: st.repo.worktree } : {}),
  ...(agentId ? { agentId } : {}),
})

const isShown = async ($: Engine) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown && p.isPlaced)

// Opens the pane once per process, on the first sign of real work. Skips when the pane is already open.
// panes() lists only open panes, so one the person closed reopens once after a reload.
const autoOpen = async ($: Engine) => {
  if (st.hasAutoOpened) return
  st.hasAutoOpened = true
  if (!(await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: 'Timeline' }).catch(() => {})
}

const record = async ($: Engine, entry: Entry) => {
  if (!st.store) return 'timeline has no repo yet'
  const error = await st.store.append(entry)
  st.entries = mergeEntries([st.entries, [entry]])
  if (error && !st.hasWarnedWrite) {
    st.hasWarnedWrite = true
    $.ui.toast(`timeline: can't write ${st.store.dir}: ${error}`, { timeoutMs: 10_000 })
  }
  if (entry.kind === 'work' && !entry.agentId) await autoOpen($)
  await redraw($)
  return error
}

// Switch the timeline to the repo `path` is in. requireGit: ignore non-git folders (a `cd` into a scratch dir).
const enterRepo = async ($: Engine, path: string, requireGit: boolean) => {
  const found = await identify($, path)
  if (requireGit && !found.isGit) return
  const newBranch = found.isGit ? await run($, ['git', '-C', path, 'symbolic-ref', '--short', '-q', 'HEAD']) : undefined
  if (st.repo?.root === found.root) {
    st.repo = found
    st.branch = newBranch ?? st.branch
    return
  }
  if (st.store) {
    await record($, { v: 1, ...(await stamp($)), kind: 'session', title: `session ${st.session.slice(0, 8)} left for ${found.name}`, event: 'close' })
  }
  st.repo = found
  st.branch = newBranch
  st.store = await openStore($, st.home, found.root, st.session)
  st.seq = st.store.lastSeq()
  st.entries = []
  st.page = 0
  st.activeTask = undefined
  await record($, { v: 1, ...(await stamp($)), kind: 'session', title: `session ${st.session.slice(0, 8)} opened`, event: 'open' })
  await reload($)
}

// /clear keeps the process but starts a new session id, with no session.start: follow it on the next prompt.
const syncSession = async ($: Engine) => {
  const id = await $.session.id()
  if (!st.session || id === st.session || !st.repo) return
  // Open first, then switch id, store and seq together: no log may be stamped with the new id into the old store.
  const opened = await openStore($, st.home, st.repo.root, id)
  st.session = id
  st.store = opened
  st.seq = opened.lastSeq()
  st.hasAutoOpened = false
  st.activeTask = undefined
  await st.store.append({ v: 1, ...(await stamp($)), kind: 'session', title: `session ${st.session.slice(0, 8)} opened`, event: 'open' })
  await reload($)
}

const here = () =>
  st.repo ? (st.repo.worktree?.startsWith('/') ? st.repo.worktree : st.repo.worktree ? `${st.repo.root}/${st.repo.worktree}` : st.repo.root) : undefined

const refreshBranch = async ($: Engine) => {
  const dir = here()
  if (dir) st.branch = (await run($, ['git', '-C', dir, 'symbolic-ref', '--short', '-q', 'HEAD'])) ?? st.branch
}

const recordFact = async ($: Engine, found: Found) =>
  record($, {
    v: 1,
    ...(await stamp($)),
    kind: 'fact',
    title: found.title,
    fact: found.fact,
    ...(st.activeTask ? { attachTo: st.activeTask } : {}),
  })

export const register: Register = on => {
  let useSection = true
  let ready: Promise<void> = Promise.resolve()

  on('session.start', async ($, e, next) => {
    st.session = await $.session.id()
    st.home = (await $.env.get('HOME')) ?? ''
    st.tz = tzMinutes(await run($, ['date', '+%z']))
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
        if (await isShown($)) await reload($)
      })().catch(() => {})
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await ready
    // append, not record: the session.end chain shares one short wall-clock bound, so no redraw here.
    if (st.store) await st.store.append({ v: 1, ...(await stamp($)), kind: 'session', title: `session ${st.session.slice(0, 8)} closed`, event: 'close' })
    // The task list and the plan belong to the conversation that ends here.
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, tasks, () => [])
      st.planPath = undefined
      st.plan = undefined
      st.page = 0
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Only a /clear changes the id; otherwise the first prompt must not wait for the initial timeline read.
    if ((await $.session.id()) !== st.session) {
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
      if (entry.status === 'active') st.activeTask = entry.task
      else if (st.activeTask === entry.task) st.activeTask = undefined
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
      if (!st.repo) return
      // A subagent working in another repo: its facts belong to that repo's timeline, not this one.
      if (e.agentId && target) {
        const there = await identify($, target)
        if (there.isGit && there.root !== st.repo.root) return
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
    const agent = e.agentId ? st.live[e.agentId] : undefined
    if (agent && e.tool !== TOOL) {
      agent.tools += 1
      agent.now = `${e.tool} ${clip(mainArg(e as unknown as Record<string, unknown>), 40) ?? ''}`.trim()
      void redraw($).catch(() => {})
    }
    return next(e)
  })

  // Claude's own task list and the plan it works from feed NOW / NEXT / BLOCKED and the PLAN bar.
  // Redraws are not awaited: the model gets its result without waiting on the pane.
  on('tool.call', { tool: [...TASK_TOOLS, ...DOC_TOOLS] }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || result.deny !== undefined || result.isError === true) return result
    if ((TASK_TOOLS as readonly string[]).includes(e.tool)) {
      // TaskList shows the live list, so it replaces the mirror (it also catches tasks changed outside this loop's own calls).
      const listed = e.tool === 'TaskList' ? fromTaskList(result.result) : undefined
      if (e.tool === 'TaskList' && !listed) return result
      const id = e.tool === 'TaskCreate' ? (createdId(result.result, result.text ?? '') ?? `c${++st.taskSeq}`) : ''
      const list = await update($, tasks, prev => listed ?? applyTaskCall(prev, e.tool, e, id))
      if (list.filter(t => t.status !== 'completed').length >= AUTO_OPEN_TASKS) void autoOpen($).catch(() => {})
      void redraw($).catch(() => {})
    } else if (typeof (e as { file_path?: unknown }).file_path === 'string') {
      const path = (e as { file_path: string }).file_path
      if (path === st.planPath) {
        if (e.tool !== 'Read') void redraw($).catch(() => {}) // the plan changed: its bar moves
      } else if (path.endsWith('.md')) {
        try {
          // Only a file with counted boxes (outside code fences) that is named as a plan or has 3+ boxes becomes the plan;
          // any other .md leaves the real one alone and is not read again until it changes.
          const { size, mtimeMs } = await $.fs.stat(path)
          if (size <= PLAN_MAX_BYTES && st.notPlan.get(path) !== mtimeMs) {
            const parsed = parsePlan(await $.fs.read(path))
            if (parsed && (/plan/i.test(path) || parsed.total >= 3)) {
              st.planPath = path
              st.plan = { path, mtime: mtimeMs, parsed }
              void redraw($).catch(() => {})
            } else st.notPlan.set(path, mtimeMs)
          }
        } catch {} // unreadable: not a plan
      }
    }
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    // Only the model's own Agent calls get the logging note; another plugin's spawn may expect its prompt untouched.
    const isModelCall = next.origin.plugin === 'engine'
    const result = await next(!e.fork && isModelCall ? { ...e, prompt: `${e.prompt}${AGENT_NOTE}` } : e)
    if (result.deny !== undefined || !result.agentId) return result
    await ready
    st.live[result.agentId] = { tools: 0, startedAt: await $.clock.now() }
    if (!e.parentAgentId) await autoOpen($) // a main-loop spawn
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
        ...(st.activeTask ? { parentTask: st.activeTask } : {}),
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
    if (!(e.agentId in st.live) && !st.entries.some(x => x.kind === 'agent' && x.agent?.id === e.agentId)) return result
    const agent = st.live[e.agentId]
    delete st.live[e.agentId]
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
      !!st.repo && typeof dir === 'string' && (dir === here() || dir === st.repo.root || dir.startsWith(`${st.repo.root}/`))
    const found = isThisRepo ? ciFact(e.previous ?? lastSnap, e.value) : undefined
    lastSnap = e.value
    if (found) await recordFact($, found)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const ui = $.ui.resolve(e)
    const { Text } = ui
    // A view stored by the code before this one (no panel) reads as not drawn yet: the next redraw replaces it.
    if (!v?.panel) return <Text dimColor>Timeline loading…</Text>

    const turn = (delta: number) => async () => {
      st.page = Math.max(0, st.page + delta)
      await redraw($)
    }
    // bodyColumns is the pane's own width (a docked pane is narrower than the screen viewport).
    return drawPane(ui, v, e.props.bodyColumns, turn)
  })
}
