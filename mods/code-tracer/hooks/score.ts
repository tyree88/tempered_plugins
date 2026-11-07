import type { Agent, Change, Evidence, FileRow, Signal } from '../types'
import { declarations, isCodePath, isConfigPath, isCosmetic, isTestPath, signatureChanges } from './capture.ts'
import { REACH_MIN } from './reach.ts'
import { rebasePath, type Placed, type Rebased } from './spans.ts'

const STOP_STEMS = new Set(['index', 'main', 'app', 'utils', 'types', 'config', 'lib'])

export const agentOf = (c: Change) => c.agentId ?? 'main'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The name other files call this one by: the stem, or the directory for an `index.*` file.
export function stemOf(path: string): string {
  const file = path.split('/').at(-1) ?? ''
  const stem = file.replace(/\.[^.]+$/, '')
  if (stem !== 'index') return stem
  return path.split('/').at(-2) ?? stem
}

// Does change `e` name the file of change `c`? Path match: the stem as a whole segment or `stem.(test|spec)`;
// hunk-text match: `\bstem\b` on an import/require/from/use line or a call `stem(`. Short or common stems match by path only.
export function namesFile(e: Change, c: Change): boolean {
  const stem = stemOf(c.path)
  if (!stem) return false
  const segs = e.path.split('/')
  const file = segs.at(-1) ?? ''
  if (segs.slice(0, -1).includes(stem) || new RegExp(`^${escapeRe(stem)}\\.(test|spec)\\.`).test(file)) return true
  if (stem.length < 3 || STOP_STEMS.has(stem)) return false
  const word = new RegExp(`\\b${escapeRe(stem)}\\b`)
  const call = new RegExp(`\\b${escapeRe(stem)}\\(`)
  return e.hunks.some(h => h.lines.some(l => (/\b(import|require|from|use)\b/.test(l) && word.test(l)) || call.test(l)))
}

const stripWs = (s: string) => s.replace(/\s+/g, '')
const sets = (c: Change) => {
  const minus = new Set<string>()
  const plus = new Set<string>()
  for (const h of c.hunks)
    for (const l of h.lines) {
      const s = stripWs(l.slice(1))
      if (!s) continue
      if (l.startsWith('-')) minus.add(s)
      else if (l.startsWith('+')) plus.add(s)
    }
  return { minus, plus }
}
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x))

// A later change on the same path that puts back what `c` changed: its `+` set is c's `-` set and vice versa.
export function revertedBy(c: Change, later: readonly Change[]): boolean {
  const mine = sets(c)
  if (!mine.minus.size || !mine.plus.size) return false
  return later.some(l => {
    if (l.path !== c.path) return false
    const theirs = sets(l)
    return sameSet(theirs.plus, mine.minus) && sameSet(theirs.minus, mine.plus)
  })
}

// Every path's hunks rebased to current lines: churn per change, overlaps between agents.
export function rebaseAll(all: readonly Change[]): Map<string, Rebased> {
  const byPath = new Map<string, Placed[]>()
  all.forEach((c, i) =>
    c.hunks.forEach((h, k) => {
      const span = c.spans[k] ?? { from: h.newStart, to: h.newStart }
      byPath.set(c.path, [...(byPath.get(c.path) ?? []), { changeId: c.id, agent: agentOf(c), order: i * 1000 + k, newStart: h.newStart, oldLines: h.oldLines, newLines: h.newLines, span }])
    }),
  )
  return new Map([...byPath].map(([path, hunks]) => [path, rebasePath(hunks)]))
}

// Points and signals for one change, given the whole session (the same agent's other changes count for completeness,
// later changes for churn and reverts). Penalties first, then points, then flags.
export function scoreOne(c: Change, all: readonly Change[], rebased: Map<string, Rebased>): Change {
  if (c.isDeleted || c.isTooLarge) {
    const { points: _points, ...rest } = c
    return { ...rest, signals: [] }
  }
  const i = all.findIndex(x => x.id === c.id)
  const later = i >= 0 ? all.slice(i + 1) : []
  const signals: Signal[] = []
  const flags: Signal[] = []
  const churn = rebased.get(c.path)?.churn.get(c.id) ?? 0
  if (churn) signals.push({ label: `churn ×${churn}`, pts: -churn })
  const isReverted = c.isReverted === true || revertedBy(c, later)
  if (isReverted) signals.push({ label: 'reverted', pts: -2 })

  const [decl] = declarations(c.hunks, c.path)
  if (decl) signals.push({ label: `adds export ${decl}`, pts: 2 })

  const mine = all.filter(e => e.id !== c.id && agentOf(e) === agentOf(c) && e.path !== c.path && !e.isDeleted)
  const named = mine.filter(e => namesFile(e, c))
  const test = named.find(e => isTestPath(e.path))
  const config = named.find(e => isConfigPath(e.path))
  const caller = named.find(e => !isTestPath(e.path) && !isConfigPath(e.path))
  if (test) signals.push({ label: `test touched ${test.path}`, pts: 2 })
  else if (caller) signals.push({ label: `caller touched ${caller.path}`, pts: 2 })
  else if (config) signals.push({ label: `config touched ${config.path}`, pts: 1 })

  const cosmetic = isCosmetic(c.hunks, c.path)
  if (c.importerPaths === undefined) flags.push({ label: 'reach unknown', pts: 0 })
  else {
    const n = c.importerPaths.length
    const pts = n >= REACH_MIN && !cosmetic ? 2 : 0
    ;(pts ? signals : flags).push({ label: `imported by ${n}`, pts })
  }

  if (cosmetic) flags.push({ label: 'cosmetic', pts: 0 })
  else signals.push({ label: 'behaviour', pts: 1 })
  if (c.whySource === 'captured') signals.push({ label: 'why', pts: 1 })

  if (c.test) {
    const mark = c.test.ok === null ? '?' : c.test.ok ? '✓' : '✗'
    ;(c.test.ok ? signals : flags).push({ label: `${mark} tested ${c.test.runner}`, pts: c.test.ok ? 2 : 0 })
  }
  if (c.check) (c.check.ok ? signals : flags).push({ label: `${c.check.ok ? '✓' : '✗'} checked ${c.check.runner}`, pts: c.check.ok ? 1 : 0 })

  for (const name of signatureChanges(c.hunks)) flags.push({ label: `⚠ signature changed ${name}`, pts: 0 })
  if (c.userModified) flags.push({ label: 'edited by you', pts: 0 })
  if (isCodePath(c.path) && !test && !c.test) flags.push({ label: 'no tests', pts: 0 })

  const out = [...signals, ...flags]
  return { ...c, ...(isReverted ? { isReverted: true } : {}), points: out.reduce((n, s) => n + s.pts, 0), signals: out }
}

// Every change rescored over the whole session; run on each append and after each test run.
export function rescore(all: readonly Change[]): Change[] {
  const rebased = rebaseAll(all)
  return all.map(c => scoreOne(c, all, rebased))
}

export type RunEvent = { kind: 'test' | 'check'; runner: string; ok: boolean | null; at: number }

// A test or check run by `by` lands on the code changes it covers: `by`'s own changes, plus (from main) the changes of
// ended subagents, each made after its owner's last passing run of that kind. `lastOk` is that boundary and is
// advanced here when the run passed. Reverted, deleted, test and config rows take none.
export function attachRun(all: readonly Change[], agents: readonly Agent[], run: RunEvent, by: string, lastOk: Map<string, number>): Change[] {
  const ended = new Set(agents.filter(a => a.endedAt).map(a => a.agentId))
  const key = (owner: string) => `${owner}:${run.kind}`
  const touched = new Set<string>()
  const out = all.map(c => {
    const owner = agentOf(c)
    if (!isCodePath(c.path) || c.isReverted || c.isDeleted || c.isTooLarge) return c
    if (owner !== by && !(by === 'main' && ended.has(owner))) return c
    if (c.at <= (lastOk.get(key(owner)) ?? 0) || c.at > run.at) return c
    touched.add(owner)
    return run.kind === 'test'
      ? { ...c, test: { runner: run.runner, ok: run.ok, at: run.at } }
      : { ...c, check: { runner: run.runner, ok: run.ok === true, at: run.at } }
  })
  if (run.ok === true) for (const owner of touched) lastOk.set(key(owner), run.at)
  return out
}

export function evidenceOf(mine: readonly Change[], all: readonly Change[]): Evidence {
  const others = (path: string, agent: string) => all.some(c => c.path === path && agentOf(c) !== agent)
  return {
    changes: mine.length,
    testsAfter: mine.filter(c => c.test && c.test.ok !== null).length,
    noWhy: mine.filter(c => c.whySource !== 'captured').length,
    reverted: mine.filter(c => c.isReverted).length,
    sharedFiles: new Set(mine.filter(c => others(c.path, agentOf(c))).map(c => c.path)).size,
  }
}

// Every path with the agents that changed it and the first intersection of two agents' rebased spans.
export function fileRows(all: readonly Change[], agents: readonly Agent[]): FileRow[] {
  const live = all.filter(c => !c.isDeleted && !c.isTooLarge)
  return [...rebaseAll(live)].map(([path, r]) => {
    const ids = [...new Set(live.filter(c => c.path === path).map(agentOf))]
    return { path, agents: ids.map(id => ({ id, tag: agents.find(x => x.agentId === id)?.tag ?? id })), ...(r.overlaps[0] ? { overlap: r.overlaps[0].span } : {}) }
  })
}
