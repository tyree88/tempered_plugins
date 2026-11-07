import type { Agent, AgentRow, Change } from '../types'
import { addsCapability, isConfigPath, isCosmetic, isTestPath, range } from './capture.ts'

export const REACH_MIN = 3 // importers at which a file counts as far-reaching

const same = (a: Change, b: Change) => (a.agentId ?? 'main') === (b.agentId ?? 'main')

const overlaps = (a: Change, b: Change) => {
  const x = range(a.hunks)
  const y = range(b.hunks)
  return x.from <= y.to && y.from <= x.to
}

// Ambition = outcome scope relative to effort, never raw size. `earlier` are this session's changes before `c`.
// The number is never shown without its signals, so each point has a label.
export function score(c: Change, earlier: readonly Change[]): { score: number; signals: string[] } {
  const signals: string[] = []
  let n = 0
  const mine = earlier.filter(e => same(e, c))
  const cosmetic = isCosmetic(c.hunks)

  if (addsCapability(c.hunks)) {
    n += 2
    signals.push('new capability')
  }
  const dir = c.path.includes('/') ? c.path.slice(0, c.path.lastIndexOf('/')) : ''
  const stem = c.path.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? ''
  // A test, config or caller counts only when it names this file: any test somewhere in the session is not completeness.
  const names = (e: Change) => stem.length >= 3 && (e.path.includes(stem) || e.hunks.some(h => h.lines.some(l => l.includes(stem))))
  const complete = mine.some(e => e.path !== c.path && (isConfigPath(e.path) || ((isTestPath(e.path) || e.path.startsWith(`${dir}/`)) && names(e))))
  if (complete) {
    n += 2
    signals.push('tests or callers touched')
  } else if (!isTestPath(c.path) && !isConfigPath(c.path)) signals.push('no tests')

  if (c.importers === undefined) signals.push('reach unknown')
  else if (c.importers >= REACH_MIN) {
    n += 2
    signals.push(`reach ${c.importers} files`)
  }

  if (!cosmetic) n += 1
  else signals.push('cosmetic')

  if (c.why) n += 1
  else signals.push('no why')

  const churn = mine.filter(e => e.path === c.path && overlaps(e, c)).length
  if (churn) {
    n -= churn
    signals.push(`churn ×${churn}`)
  }
  if (c.userModified) {
    n -= 1
    signals.push('user modified')
  }
  // 8 points available before penalties; scale to 10.
  return { score: Math.max(0, Math.min(10, Math.round((n * 10) / 8))), signals }
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export const sessionScore = (changes: readonly Change[]) => mean(changes.map(c => c.score))

// One row per agent that made a change or is still running, the main loop first, then by first change.
export function agentRows(changes: readonly Change[], agents: readonly Agent[], now: number): AgentRow[] {
  const ids = ['main', ...agents.map(a => a.agentId)]
  const rows: AgentRow[] = []
  for (const id of ids) {
    const mine = changes.filter(c => (c.agentId ?? 'main') === id)
    const a = agents.find(x => x.agentId === id)
    if (!mine.length && !(a && !a.endedAt)) continue
    const label = id === 'main' ? 'main' : a?.type ?? id.slice(0, 8)
    rows.push({
      id,
      label: a?.description && id !== 'main' ? `${label} · ${a.description}` : label,
      model: a?.model ?? '',
      isRunning: !!a && !a.endedAt,
      files: new Set(mine.map(c => c.path)).size,
      additions: mine.reduce((n, c) => n + c.additions, 0),
      deletions: mine.reduce((n, c) => n + c.deletions, 0),
      score: mean(mine.map(c => c.score)),
      leverage: a ? `${a.edits} edit${a.edits === 1 ? '' : 's'} / ${a.reads} read${a.reads === 1 ? '' : 's'}${a.asks ? ` · ${a.asks} asked` : ''}` : '',
    })
  }
  void now
  return rows.sort((x, y) => Number(y.isRunning) - Number(x.isRunning))
}
