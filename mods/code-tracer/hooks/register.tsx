import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Agent, Change, FileRow, View } from '../types'
import { changeOf, patchesFromBash, patchesFromEdit, range } from './capture.ts'
import { toMarkdown } from './export.ts'
import { drawPane } from './pane'
import { agentRows, score, sessionScore } from './score.ts'
import { whyOf } from './why.ts'

const view = atom({ plugin: 'code-tracer', key: 'view' } as const, null)
const changes = atom({ plugin: 'code-tracer', key: 'changes' } as const, [] as Change[])
const agents = atom({ plugin: 'code-tracer', key: 'agents' } as const, [] as Agent[])

const PANE = 'code-tracer'
const PAGE_SIZE = 20
const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit|Bash)$/ // a RegExp: Grep, Glob and MultiEdit are not registered on every build
const READ_TOOLS = /^(Read|Grep|Glob|WebFetch|WebSearch)$/
const STORE_MAX = 3_900_000 // $.fs.write caps at 4 MiB; past this the session's file stops growing

// Shared by the hooks and the top-level helpers: the loader lets $ reach only functions declared at the top of this file.
const st = {
  session: '',
  home: '',
  tz: 0,
  root: undefined as string | undefined, // the repo's top level; undefined outside git
  repo: 'code-tracer',
  branch: undefined as string | undefined,
  seq: 0,
  page: 0,
  mode: 'feed' as View['mode'],
  filter: undefined as string | undefined,
  expanded: [] as string[],
  reach: new Map<string, number | undefined>(), // path → importer count, once per path per session
  hasAutoOpened: false,
  hasWarnedWrite: false,
  storeFull: false,
  drawSeq: 0,
}

async function run($: Engine, argv: string[], cwd?: string): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, { ...(cwd ? { cwd } : {}), timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

const folderName = (root: string) => root.replace(/^\//, '').replace(/[\/\s]+/g, '-')
const storePath = () => `${st.home}/.claude/code-tracer/${folderName(st.root ?? st.repo)}/${st.session}.jsonl`

// Files in the repo that mention the changed file's stem, the file itself excluded. Undefined outside git or on failure.
async function importers($: Engine, path: string): Promise<number | undefined> {
  if (st.reach.has(path)) return st.reach.get(path)
  let n: number | undefined
  if (st.root) {
    const stem = path.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? ''
    const out = stem.length >= 3 ? await run($, ['git', '-C', st.root, 'grep', '-l', '-F', '--', stem, '.', `:!${path}`]) : undefined
    n = out === undefined ? undefined : out ? out.split('\n').length : 0
  }
  st.reach.set(path, n)
  return n
}

// One write at a time: parallel subagents must not let an older whole-file write land last.
let chain: Promise<unknown> = Promise.resolve()
async function persist($: Engine, all: readonly Change[]) {
  if (!st.home || st.storeFull) return
  const text = all.map(c => JSON.stringify(c)).join('\n')
  if (text.length > STORE_MAX) {
    st.storeFull = true
    $.ui.toast('code-tracer: session log is full; the pane keeps working, the file stops growing', { timeoutMs: 8_000 })
    return
  }
  chain = chain.then(() => $.fs.write(storePath(), text)).catch(error => {
    if (st.hasWarnedWrite) return
    st.hasWarnedWrite = true
    $.ui.toast(`code-tracer: can't write ${storePath()}: ${error instanceof Error ? error.message : String(error)}`, { timeoutMs: 10_000 })
  })
  await chain
}

async function load($: Engine): Promise<Change[]> {
  try {
    const text = await $.fs.read(storePath())
    if (typeof text !== 'string') return []
    return text
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        try {
          const c = JSON.parse(line) as Change
          return c.v === 1 && c.id && Array.isArray(c.hunks) ? [c] : []
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

const fileRows = (all: readonly Change[], labelOf: (c: Change) => string): FileRow[] => {
  const byPath = new Map<string, Change[]>()
  for (const c of all) byPath.set(c.path, [...(byPath.get(c.path) ?? []), c])
  return [...byPath]
    .map(([path, cs]) => {
      const ranges = cs.map(c => ({ agent: labelOf(c), ...range(c.hunks) }))
      const byAgent = new Map<string, { from: number; to: number }[]>()
      for (const r of ranges) byAgent.set(r.agent, [...(byAgent.get(r.agent) ?? []), r])
      const agentsHere = [...byAgent.keys()]
      const hasOverlap = ranges.some((a, i) => ranges.some((b, j) => i < j && a.agent !== b.agent && a.from <= b.to && b.from <= a.to))
      return { path, agents: agentsHere, ranges, hasOverlap }
    })
    .sort((a, b) => Number(b.hasOverlap) - Number(a.hasOverlap) || b.agents.length - a.agents.length)
}

const redraw = async ($: Engine) => {
  const mine = ++st.drawSeq
  const all = await read($, changes)
  const rows = agentRows(all, await read($, agents), await $.clock.now())
  // The full label (type · description): two agents of one type must stay two agents in the file view.
  const label = (c: Change) => rows.find(r => r.id === (c.agentId ?? 'main'))?.label ?? 'main'
  const visible = st.filter ? all.filter(c => (c.agentId ?? 'main') === st.filter) : all
  const newestFirst = [...visible].reverse()
  const pages = Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE))
  st.page = Math.min(st.page, pages - 1)
  const next: View = {
    repo: st.repo,
    ...(st.branch ? { branch: st.branch } : {}),
    changes: all.length,
    files: new Set(all.map(c => c.path)).size,
    agents: rows,
    sessionScore: sessionScore(all),
    mode: st.mode,
    ...(st.filter ? { filter: st.filter } : {}),
    feed: newestFirst.slice(st.page * PAGE_SIZE, (st.page + 1) * PAGE_SIZE),
    fileRows: fileRows(visible, label),
    expanded: st.expanded,
    page: st.page,
    pages,
  }
  if (mine !== st.drawSeq) return
  await update($, view, prev => (mine === st.drawSeq ? next : prev))
}

const isShown = async ($: Engine) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown && p.isPlaced)

const autoOpen = async ($: Engine) => {
  if (st.hasAutoOpened) return
  st.hasAutoOpened = true
  if (!(await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: 'Code tracer' }).catch(() => {})
}

const bump = async ($: Engine, agentId: string | undefined, field: 'reads' | 'edits' | 'asks') => {
  if (!agentId) return
  await update($, agents, prev => prev.map(a => (a.agentId === agentId ? { ...a, [field]: a[field] + 1 } : a)))
}

// Record every file a finished edit or shell write touched: who, where, the hunks, the why, the score.
async function track($: Engine, tool: Change['tool'], toolUseId: string, agentId: string | undefined, result: unknown) {
  const patches = tool === 'Bash' ? patchesFromBash(result) : patchesFromEdit(result)
  if (!patches.length) return
  const known = (await read($, agents)).find(a => a.agentId === agentId)
  let why: Pick<Change, 'why' | 'whySource'>
  try {
    const messages = await $.session.messages(agentId ? { agentId } : {})
    why = whyOf(Array.isArray(messages) ? messages : [], toolUseId, known?.description ?? '')
  } catch {
    why = whyOf([], toolUseId, known?.description ?? '')
  }
  const at = await $.clock.now()
  for (const patch of patches) {
    const base = changeOf(
      { v: 1, id: `${st.session.slice(0, 8)}-${++st.seq}`, at, session: st.session, ...(agentId ? { agentId } : {}), tool, ...why },
      patch,
      st.root,
    )
    const c: Change = { ...base, importers: await importers($, base.path) }
    const all = await read($, changes)
    const scored: Change = { ...c, ...score(c, all) }
    const next = [...all, scored]
    await update($, changes, () => next)
    await persist($, next)
  }
  await bump($, agentId, 'edits')
  if (!agentId) await autoOpen($)
  await redraw($)
}

export const register: Register = on => {
  let ready: Promise<void> = Promise.resolve()

  on('session.start', async ($, e, next) => {
    st.session = await $.session.id()
    st.home = (await $.env.get('HOME')) ?? ''
    await $.command.register({ name: 'code-tracer', description: 'Show or hide the code tracer pane; `/code-tracer export` writes a markdown report' })
    ready = (async () => {
      const cwd = await $.session.cwd()
      const top = await run($, ['git', '-C', cwd, 'rev-parse', '--show-toplevel'])
      st.root = top?.startsWith('/') ? top : undefined
      st.repo = (st.root ?? cwd).split('/').filter(Boolean).at(-1) ?? 'code-tracer'
      st.branch = st.root ? await run($, ['git', '-C', st.root, 'symbolic-ref', '--short', '-q', 'HEAD']) : undefined
      const z = (await run($, ['date', '+%z'])) ?? '+0000'
      st.tz = (z.startsWith('-') ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)))
      const stored = await load($)
      if (stored.length) {
        st.seq = Math.max(st.seq, ...stored.map(c => Number(c.id.split('-').at(-1)) || 0))
        await update($, changes, prev => (prev.length ? prev : stored))
      }
      await redraw($)
    })().catch(() => {})
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, changes, () => [])
      await update($, agents, () => [])
      st.expanded = []
      st.filter = undefined
      st.page = 0
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || !r.agentId) return r
    await ready
    const a: Agent = {
      agentId: r.agentId,
      type: e.subagentType,
      description: e.description,
      model: r.model,
      ...(e.parentAgentId ? { parentAgentId: e.parentAgentId } : {}),
      startedAt: await $.clock.now(),
      reads: 0,
      edits: 0,
      asks: 0,
    }
    await update($, agents, prev => [...prev.filter(x => x.agentId !== a.agentId), a])
    await redraw($)
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const at = await $.clock.now()
      await update($, agents, prev => prev.map(a => (a.agentId === e.agentId ? { ...a, endedAt: at } : a)))
      await redraw($)
    }
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const v = await next(e)
    if (v.decision === 'ask' && e.agentId) void bump($, e.agentId, 'asks').catch(() => {})
    return v
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: READ_TOOLS }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId && !r.isError) void bump($, e.agentId, 'reads').catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  // The model never waits on the bookkeeping: the result goes back first.
  on('tool.call', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const r = await next(e)
    if (r.isError || r.result === undefined) return r
    void ready.then(() => track($, String(e.tool) as Change['tool'], e.tool_use_id, e.agentId, r.result)).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'code-tracer' }, async ($, e) => {
    await ready
    if (e.args.trim() === 'export') {
      const all = await read($, changes)
      if (!all.length) return { text: 'code-tracer: no changes to export yet.' }
      const path = storePath().replace(/\.jsonl$/, '.md')
      try {
        await $.fs.write(path, toMarkdown(st.repo, st.branch, all, await read($, agents)))
        return { text: `code-tracer: report written to ${path}` }
      } catch (error) {
        return { text: `code-tracer: can't write ${path}: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
    if (await isShown($)) {
      await $.ui.close({ id: PANE })
      return { text: 'Code tracer closed.' }
    }
    await redraw($)
    await $.ui.open({ id: PANE, title: 'Code tracer' })
    return { text: 'Code tracer opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!v) return <Text dimColor>Code tracer loading…</Text>
    const handlers = {
      mode: async () => {
        st.mode = st.mode === 'feed' ? 'files' : 'feed'
        await redraw($)
      },
      filter: (id: string) => async () => {
        st.filter = st.filter === id ? undefined : id
        st.page = 0
        await redraw($)
      },
      expand: (id: string) => async () => {
        st.expanded = st.expanded.includes(id) ? st.expanded.filter(x => x !== id) : [...st.expanded, id]
        await redraw($)
      },
      page: (delta: number) => async () => {
        st.page = Math.max(0, st.page + delta)
        await redraw($)
      },
    }
    return drawPane({ Box, Text, Button }, v, e.props.bodyColumns, st.tz, handlers)
  })
}
