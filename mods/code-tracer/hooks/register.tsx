import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Agent, Change, Improvement, StoreRow, View } from '../types'
import { changeOf, normalizePath, patchesFromBash, patchesFromEdit } from './capture.ts'
import { ellipsize } from './ellipsis.ts'
import { toMarkdown } from './export.ts'
import { drawPane } from './pane'
import { importersOf, reachQuery } from './reach.ts'
import { SYSTEM, buildPrompt, candidates, closeOn, composeSection, openOnes, parseFindings } from './reflect.ts'
import { bashTarget, detectRun, isReadCommand, revertedPaths } from './runs.ts'
import { agentOf, agentRows, attachRun, evidenceOf, fileRows, rescore } from './score.ts'
import { tagsFor } from './tags.ts'
import { whyOf } from './why.ts'

const view = atom({ plugin: 'code-tracer', key: 'view' } as const, null)
const changes = atom({ plugin: 'code-tracer', key: 'changes' } as const, [] as Change[])
const agents = atom({ plugin: 'code-tracer', key: 'agents' } as const, [] as Agent[])
const improvements = atom({ plugin: 'code-tracer', key: 'improvements' } as const, [] as Improvement[])

const PANE = 'code-tracer'
const PAGE_SIZE = 20
const FILE_PAGE_SIZE = 30
const SHOWN_DONE = 3
// RegExps: Grep, Glob and MultiEdit are not registered on every build, and a string filter on a missing tool fails.
const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/
const READ_TOOLS = /^(Read|Grep|Glob|WebFetch|WebSearch)$/
const STORE_MAX = 3_900_000 // $.fs.write caps at 4 MiB; past this the session's part stops growing

// Shared by the hooks and the top-level helpers: the loader lets $ reach only functions declared at the top of this file.
const st = {
  session: '',
  home: '',
  cwd: '/',
  tz: 0,
  root: undefined as string | undefined, // the repo's top level; undefined outside git
  repo: 'code-tracer',
  branch: undefined as string | undefined,
  seq: 0,
  part: 0, // store part: `<session>.jsonl`, then `<session>-1.jsonl` after a /clear
  page: 0,
  filePage: 0,
  mode: 'feed' as View['mode'],
  filter: undefined as string | undefined,
  pathFilter: undefined as string | undefined,
  focusPath: undefined as string | undefined,
  expanded: [] as string[],
  showAll: false,
  tagWidth: undefined as 12 | 18 | undefined, // fixed at the first render
  reach: new Map<string, string[] | undefined>(), // path → importer paths, once per path per session
  lastOk: new Map<string, number>(), // `<agent>:<test|check>` → time of the last passing run
  hasAutoOpened: false,
  hasWarnedWrite: false,
  storeFull: false,
  drawSeq: 0,
  reflector: false, // userConfig.reflector: one haiku call after each main turn that changed code
  rseq: 0,
  reflecting: false,
  changesSinceReflect: 0,
  reflectAt: undefined as number | undefined,
  reflectError: undefined as string | undefined,
}

const tagWidth = () => st.tagWidth ?? 12

async function run($: Engine, argv: string[], cwd?: string): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, { ...(cwd ? { cwd } : {}), timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

const folderName = (root: string) => root.replace(/^\//, '').replace(/[\/\s]+/g, '-')
const storeDir = () => `${st.home}/.claude/code-tracer/${folderName(st.root ?? st.repo)}`
const partName = (n: number) => (n ? `${st.session}-${n}.jsonl` : `${st.session}.jsonl`)
const storePath = () => `${storeDir()}/${partName(st.part)}`

// Files in the repo that import the changed file, by the extension's pattern. Undefined outside git, on failure, or
// for an extension without a pattern (`reach unknown`).
async function importers($: Engine, path: string): Promise<string[] | undefined> {
  if (st.reach.has(path)) return st.reach.get(path)
  let out: string[] | undefined
  const q = reachQuery(path)
  if (st.root && q) {
    const grep = await run($, ['git', '-C', st.root, 'grep', '-l', '-I', '-E', '-e', q.regex, '--', '.', `:!${path}`])
    if (grep !== undefined) {
      let found = grep ? grep.split('\n') : []
      if (q.kind === 'go') found = [...found, ...(((await run($, ['git', '-C', st.root, 'ls-files', '--', `${q.dir}/*.go`])) ?? '').split('\n').filter(Boolean))]
      out = importersOf(found, path)
    }
  }
  st.reach.set(path, out)
  return out
}

// One write at a time: parallel subagents must not let an older whole-file write land last.
let chain: Promise<unknown> = Promise.resolve()
async function persist($: Engine) {
  if (!st.home || st.storeFull) return
  const rows: StoreRow[] = [
    ...(await read($, agents)).map(a => ({ kind: 'agent' as const, ...a })),
    ...(await read($, changes)).map(c => ({ kind: 'change' as const, ...c })),
    ...(await read($, improvements)).map(i => ({ kind: 'improvement' as const, item: i })),
  ]
  const text = rows.map(r => JSON.stringify(r)).join('\n')
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

const parseRows = (text: string): StoreRow[] =>
  text
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        const r = JSON.parse(line) as StoreRow
        return (r.kind === 'change' && r.v === 1 && r.id && Array.isArray(r.hunks)) || (r.kind === 'agent' && r.agentId) || (r.kind === 'improvement' && r.item?.v === 1 && r.item.changeId) ? [r] : []
      } catch {
        return []
      }
    })

// Changes come from the newest part (the current conversation); agents and their `#N` counters from every part.
async function load($: Engine): Promise<{ changes: Change[]; agents: Agent[]; improvements: Improvement[] }> {
  const listed = await $.fs.list(storeDir()).catch(() => [])
  const parts = listed
    .filter(f => f.kind === 'file')
    .map(f => (f.name === partName(0) ? 0 : (f.name.match(/^(.+)-(\d+)\.jsonl$/) ?? [])[1] === st.session ? Number(f.name.match(/-(\d+)\.jsonl$/)?.[1]) : -1))
    .filter(n => n >= 0)
    .sort((a, b) => a - b)
  if (!parts.length) return { changes: [], agents: [], improvements: [] }
  st.part = parts.at(-1) ?? 0
  const byId = new Map<string, Agent>()
  let latest: Change[] = []
  let found: Improvement[] = []
  for (const n of parts) {
    const rows = parseRows((await $.fs.read(`${storeDir()}/${partName(n)}`).catch(() => '')) as string)
    for (const r of rows) {
      if (r.kind === 'agent') {
        const { kind: _kind, ...a } = r
        byId.set(a.agentId, a)
      }
    }
    if (n === st.part) {
      latest = rows.flatMap(r => (r.kind === 'change' ? [(({ kind: _kind, ...c }) => c)(r)] : []))
      found = rows.flatMap(r => (r.kind === 'improvement' ? [r.item] : []))
    }
  }
  return { changes: latest, agents: [...byId.values()], improvements: found }
}

// Every agent's tag recomputed over the spawn order at the session's tag width, so `#N` counters stay stable.
async function retag($: Engine) {
  await update($, agents, prev => {
    const tags = tagsFor(
      prev.map(a => a.type),
      tagWidth(),
    )
    return prev.some((a, i) => a.tag !== tags[i]) ? prev.map((a, i) => ({ ...a, tag: tags[i] ?? a.tag })) : prev
  })
}

const touchAgent = async ($: Engine, id: string, patch: (a: Agent) => Agent) => update($, agents, prev => prev.map(a => (a.agentId === id ? patch(a) : a)))

async function ensureMain($: Engine) {
  const now = await $.clock.now()
  await update($, agents, prev =>
    prev.some(a => a.agentId === 'main') ? prev : [{ agentId: 'main', type: 'main', tag: 'main', description: '', model: '', startedAt: now, endedAt: now, reads: 0, edits: 0, asks: 0 }, ...prev],
  )
}

const redraw = async ($: Engine) => {
  const mine = ++st.drawSeq
  const all = await read($, changes)
  const known = await read($, agents)
  const now = await $.clock.now()
  const rows = agentRows(all, known, now)
  const done = rows.filter(r => r.state === 'done')
  const hiddenDone = st.showAll ? 0 : Math.max(0, done.length - SHOWN_DONE)
  const shownRows = hiddenDone ? rows.filter(r => r.state !== 'done' || done.indexOf(r) < SHOWN_DONE) : rows
  const allFiles = fileRows(all, known)
  const visible = all.filter(c => (!st.filter || agentOf(c) === st.filter) && (!st.pathFilter || c.path === st.pathFilter))
  const newestFirst = [...visible].reverse()
  const pages = Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE))
  st.page = Math.min(st.page, pages - 1)
  const touched = st.filter ? new Set(all.filter(c => agentOf(c) === st.filter).map(c => c.path)) : undefined
  const files = fileRows(all, known, touched).sort((x, y) => Number(y.path === st.focusPath) - Number(x.path === st.focusPath))
  const filePages = Math.max(1, Math.ceil(files.length / FILE_PAGE_SIZE))
  const open = openOnes(await read($, improvements))
  st.filePage = Math.min(st.filePage, filePages - 1)
  const next: View = {
    repo: st.repo,
    ...(st.branch ? { branch: st.branch } : {}),
    changes: all.length,
    files: new Set(all.map(c => c.path)).size,
    running: rows.filter(r => r.state === 'running').length,
    agents: shownRows,
    hiddenDone,
    evidence: evidenceOf(all, all),
    conflicts: { files: allFiles.filter(f => f.agents.length > 1).length, overlapping: allFiles.filter(f => f.overlap).length },
    mode: st.mode,
    ...(st.filter ? { filter: st.filter } : {}),
    ...(st.pathFilter ? { pathFilter: st.pathFilter } : {}),
    ...(st.focusPath ? { focusPath: st.focusPath } : {}),
    tagWidth: tagWidth(),
    feed: newestFirst.slice(st.page * PAGE_SIZE, (st.page + 1) * PAGE_SIZE),
    fileRows: files.slice(st.filePage * FILE_PAGE_SIZE, (st.filePage + 1) * FILE_PAGE_SIZE),
    expanded: st.expanded,
    page: st.page,
    pages,
    filePage: st.filePage,
    filePages,
    improvements: open,
    reflector: { enabled: st.reflector, open: open.length, ...(st.reflectAt !== undefined ? { lastAt: st.reflectAt } : {}), ...(st.reflectError ? { lastError: st.reflectError } : {}) },
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

// Record every file a finished edit or shell write touched: who, where, the hunks, the why; then rescore the session.
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
    const base = changeOf({ v: 1, id: `${st.session.slice(0, 8)}-${++st.seq}`, at, session: st.session, ...(agentId ? { agentId } : {}), tool, ...why }, patch, st.cwd, st.root)
    const c: Change = patch.isDeleted || patch.isTooLarge ? base : { ...base, importerPaths: await importers($, base.path) }
    const all = await update($, changes, prev => rescore([...prev, c]))
    await update($, improvements, prev => closeOn(prev, c, all))
    st.changesSinceReflect += 1
  }
  await persist($)
  await touchAgent($, agentId ?? 'main', a => ({ ...a, edits: a.edits + 1 }))
  if (!agentId) await autoOpen($)
  await redraw($)
}

// One reflector cycle: the weak, unreviewed changes go to haiku once; each finding becomes an improvement row.
// Returns how many rows were added, or undefined when the call was refused or unanswered (the reason is kept for the pane).
async function reflect($: Engine): Promise<number | undefined> {
  if (st.reflecting) return 0
  st.reflecting = true
  try {
    const all = await read($, changes)
    const cands = candidates(all, await read($, improvements))
    st.changesSinceReflect = 0
    if (!cands.length) return 0
    const reply = await $.model.complete({ model: 'haiku', effort: 'low', maxTokens: 800, timeoutMs: 20_000, system: SYSTEM, prompt: buildPrompt(cands) }).catch((err: unknown) => {
      st.reflectError = err instanceof Error ? err.message : String(err)
      return null
    })
    if (!reply) return undefined
    if (!reply.isAnswered) {
      st.reflectError = reply.reason
      return undefined
    }
    st.reflectError = undefined
    st.reflectAt = await $.clock.now()
    const at = st.reflectAt
    const found = parseFindings(reply.text, cands).map(f => ({ v: 1 as const, id: `${st.session.slice(0, 8)}-r${++st.rseq}`, changeId: f.changeId, path: cands.find(c => c.id === f.changeId)?.path ?? '', kind: f.kind, suggestion: f.suggestion, at }))
    if (found.length) {
      await update($, improvements, prev => [...prev, ...found])
      await persist($)
    }
    return found.length
  } finally {
    st.reflecting = false
    await redraw($)
  }
}

const lastTargetOf = (tool: string, e: Record<string, unknown>) => {
  const path = typeof e.file_path === 'string' ? e.file_path : typeof e.notebook_path === 'string' ? e.notebook_path : undefined
  if (path) return ellipsize(normalizePath(path, st.cwd, st.root), 24)
  if (tool === 'Bash') return bashTarget(String(e.command ?? ''))
  if (typeof e.pattern === 'string') return e.pattern.slice(0, 24)
  if (typeof e.subagent_type === 'string') return e.subagent_type.slice(0, 24)
  if (typeof e.skill === 'string') return e.skill.slice(0, 24)
  return ''
}

// Bookkeeping after any tool call: last action, reads, runs, reverts, captures. Never awaited by the model.
async function afterCall($: Engine, e: Record<string, unknown>, r: { isError?: boolean; result?: unknown }) {
  const tool = String(e.tool)
  const agentId = typeof e.agentId === 'string' ? e.agentId : undefined
  const id = agentId ?? 'main'
  const now = await $.clock.now()
  const command = tool === 'Bash' ? String(e.command ?? '') : ''
  const isRead = READ_TOOLS.test(tool) || (tool === 'Bash' && isReadCommand(command))
  await touchAgent($, id, a => ({
    ...a,
    lastAt: now,
    lastTool: tool,
    lastTarget: lastTargetOf(tool, e),
    reads: a.reads + (isRead && !r.isError ? 1 : 0),
    ...(agentId && a.endedAt ? { endedAt: undefined } : {}), // activity after `turn.complete`: continued via SendMessage
  }))
  let dirty = false
  if (tool === 'Bash' && r.result && typeof r.result === 'object') {
    const res = r.result as { stdout?: string; stderr?: string; interrupted?: boolean }
    if (!res.interrupted) {
      const detected = detectRun(command, { isError: r.isError === true, output: `${res.stdout ?? ''}\n${res.stderr ?? ''}` })
      if (detected) {
        const known = await read($, agents)
        await update($, changes, prev => rescore(attachRun(prev, known, { ...detected, at: now }, id, st.lastOk)))
        dirty = true
      }
      const reverted = new Set(revertedPaths(command).map(p => normalizePath(p, st.cwd, st.root)))
      if (reverted.size) {
        await update($, changes, prev => rescore(prev.map(c => (reverted.has(c.path) && !c.isReverted ? { ...c, isReverted: true } : c))))
        dirty = true
      }
    }
    if (!r.isError) await track($, 'Bash', String(e.tool_use_id ?? ''), agentId, r.result)
  } else if (EDIT_TOOLS.test(tool) && !r.isError && r.result !== undefined) {
    await track($, tool as Change['tool'], String(e.tool_use_id ?? ''), agentId, r.result)
  }
  if (dirty) await persist($)
  await redraw($)
}

export const register: Register = (on, options) => {
  let ready: Promise<void> = Promise.resolve()
  st.reflector = options.reflector === true

  on('session.start', async ($, e, next) => {
    st.session = await $.session.id()
    st.home = (await $.env.get('HOME')) ?? ''
    await $.command.register({ name: 'code-tracer', description: 'Show or hide the code tracer pane; `/code-tracer export` writes a markdown report; `/code-tracer reflect` runs one reflector review (one haiku call)' })
    ready = (async () => {
      st.cwd = await $.session.cwd()
      const top = await run($, ['git', '-C', st.cwd, 'rev-parse', '--show-toplevel'])
      st.root = top?.startsWith('/') ? top : undefined
      st.repo = (st.root ?? st.cwd).split('/').filter(Boolean).at(-1) ?? 'code-tracer'
      st.branch = st.root ? await run($, ['git', '-C', st.root, 'symbolic-ref', '--short', '-q', 'HEAD']) : undefined
      const z = (await run($, ['date', '+%z'])) ?? '+0000'
      st.tz = (z.startsWith('-') ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)))
      const stored = await load($)
      if (stored.changes.length) {
        st.seq = Math.max(st.seq, ...stored.changes.map(c => Number(c.id.split('-').at(-1)) || 0))
        for (const c of stored.changes)
          for (const kind of ['test', 'check'] as const) {
            const r = c[kind]
            if (r?.ok) st.lastOk.set(`${agentOf(c)}:${kind}`, Math.max(st.lastOk.get(`${agentOf(c)}:${kind}`) ?? 0, r.at))
          }
        await update($, changes, prev => (prev.length ? prev : stored.changes))
      }
      if (stored.improvements.length) {
        st.rseq = Math.max(st.rseq, ...stored.improvements.map(i => Number(i.id.split('-r').at(-1)) || 0))
        await update($, improvements, prev => (prev.length ? prev : stored.improvements))
      }
      if (stored.agents.length) {
        const at = await $.clock.now()
        // Nothing runs across a restart: every stored agent is done, main idle; tags are re-cut to this session's width.
        await update($, agents, prev => (prev.length ? prev : stored.agents.map(a => ({ ...a, endedAt: a.endedAt ?? at }))))
      }
      await ensureMain($)
      await retag($)
      await redraw($)
    })().catch(() => {})
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await ready
    const at = await $.clock.now()
    await touchAgent($, 'main', a => ({ ...a, endedAt: at }))
    if (e.reason === 'clear') {
      // The conversation ends; its rows stay in the current part. The next change opens the next part.
      st.part += 1
      st.seq = 0
      st.expanded = []
      st.filter = undefined
      st.pathFilter = undefined
      st.focusPath = undefined
      st.page = 0
      st.filePage = 0
      st.hasAutoOpened = false
      await update($, changes, () => [])
      await update($, improvements, () => [])
      await update($, agents, prev => prev.map(a => (a.endedAt ? a : { ...a, endedAt: at })))
      st.rseq = 0
      st.changesSinceReflect = 0
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
      tag: '',
      description: e.description,
      model: r.model,
      ...(e.parentAgentId ? { parentAgentId: e.parentAgentId } : {}),
      startedAt: await $.clock.now(),
      reads: 0,
      edits: 0,
      asks: 0,
    }
    await update($, agents, prev => [...prev.filter(x => x.agentId !== a.agentId), a])
    await retag($)
    await persist($)
    await redraw($)
    return r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    void ready
      .then(async () => {
        const at = await $.clock.now()
        if (e.agentId) await touchAgent($, e.agentId, a => (a.endedAt ? { ...a, endedAt: undefined } : a))
        else await touchAgent($, 'main', a => ({ ...a, startedAt: at, endedAt: undefined }))
        await redraw($)
      })
      .catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    void ready
      .then(async () => {
        const at = await $.clock.now()
        await touchAgent($, e.agentId ?? 'main', a => ({ ...a, endedAt: at }))
        await redraw($)
        if (!e.agentId && st.reflector && st.changesSinceReflect > 0 && e.reason === 'answer') await reflect($)
      })
      .catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  // Open findings reach the next step as one session section; nothing is added while none is open.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const text = composeSection(openOnes(await read($, improvements)))
    return text ? { ...r, sections: [...r.sections, { id: 'code-tracer:reflector', text, scope: 'session' as const }] } : r
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const v = await next(e)
    if (e.agentId) {
      const id = e.agentId
      const asked = v.decision === 'ask'
      void ready
        .then(() => touchAgent($, id, a => ({ ...a, asks: a.asks + (asked ? 1 : 0), ...(a.endedAt ? { endedAt: undefined } : {}) })))
        .catch(() => {})
    }
    return v
  }).catch(($, e, next) => next(e))

  // Every tool: the model never waits on the bookkeeping, the result goes back first.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    void ready.then(() => afterCall($, e as unknown as Record<string, unknown>, r)).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'code-tracer' }, async ($, e) => {
    await ready
    if (e.args.trim() === 'reflect') {
      if (!(await read($, changes)).length) return { text: 'code-tracer: no changes to review yet.' }
      const n = await reflect($)
      if (n === undefined) return { text: `code-tracer: the review did not run: ${st.reflectError ?? 'unknown'}` }
      return { text: n ? `code-tracer: ${n} improvement${n === 1 ? '' : 's'} added; see the pane.` : 'code-tracer: nothing to improve among the unreviewed changes.' }
    }
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
    if (st.tagWidth === undefined) {
      // Fixed per session at the first render. State writes are refused while drawing: retag after this hook settles.
      st.tagWidth = e.props.bodyColumns >= 90 ? 18 : 12
      void Promise.resolve()
        .then(() => retag($))
        .then(() => redraw($))
        .catch(() => {})
    }
    if (!v) return <Text dimColor>Code tracer loading…</Text>
    const go = (fn: () => void) => async () => {
      fn()
      await redraw($)
    }
    const handlers = {
      mode: go(() => {
        st.mode = st.mode === 'feed' ? 'files' : 'feed'
      }),
      filter: (id: string) =>
        go(() => {
          st.filter = st.filter === id ? undefined : id
          st.page = 0
          st.filePage = 0
        }),
      expand: (id: string) =>
        go(() => {
          st.expanded = st.expanded.includes(id) ? st.expanded.filter(x => x !== id) : [...st.expanded, id]
        }),
      page: (delta: number) =>
        go(() => {
          st.page = Math.max(0, st.page + delta)
        }),
      filePage: (delta: number) =>
        go(() => {
          st.filePage = Math.max(0, st.filePage + delta)
        }),
      showConflicts: go(() => {
        st.mode = 'files'
        st.filter = undefined
        st.pathFilter = undefined
        st.focusPath = undefined
        st.filePage = 0
      }),
      clear: go(() => {
        st.filter = undefined
        st.pathFilter = undefined
        st.page = 0
        st.filePage = 0
      }),
      file: (path: string) =>
        go(() => {
          if (st.mode === 'feed') {
            st.mode = 'files'
            st.focusPath = path
            st.filePage = 0
          } else {
            st.mode = 'feed'
            st.pathFilter = path
            st.page = 0
          }
        }),
      showAll: go(() => {
        st.showAll = true
      }),
    }
    return drawPane({ Box, Text, Button }, v, e.props.bodyColumns, st.tz, handlers)
  })
}
