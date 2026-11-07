import type { Agent, Change } from '../types'
import { agentOf, evidenceOf } from './score.ts'

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')
const where = (c: Change) => (c.spans.length ? c.spans.map(s => (s.to > s.from ? `${s.from}-${s.to}` : `${s.from}`)).join(', ') : '')

// A markdown report: one section per agent, one block per change with where, why, signals and the hunk. A PR body seed.
export function toMarkdown(repo: string, branch: string | undefined, changes: readonly Change[], agents: readonly Agent[]): string {
  const out: string[] = [`# Code changes · ${repo}${branch ? ` ⎇ ${branch}` : ''}`, '']
  const ev = evidenceOf(changes, changes)
  out.push(`${changes.length} changes · ${new Set(changes.map(c => c.path)).size} files · tests ran after ${ev.testsAfter} of ${ev.changes} · ${ev.noWhy} no why${ev.reverted ? ` · ${ev.reverted} reverted` : ''}`, '')
  const ids = ['main', ...agents.map(a => a.agentId).filter(id => id !== 'main')].filter(id => changes.some(c => agentOf(c) === id))
  for (const id of ids) {
    const a = agents.find(x => x.agentId === id)
    out.push(`## ${id === 'main' ? 'main' : `${a?.type ?? id}${a?.description ? ` — ${a.description}` : ''}`}${a?.model ? ` (${a.model})` : ''}`, '')
    for (const c of changes.filter(c => agentOf(c) === id)) {
      const lines = where(c)
      out.push(`### ${c.path}${lines ? `:${lines}` : ''} · +${c.additions} −${c.deletions}${c.isDeleted ? ' · deleted' : c.isTooLarge ? ' · diff too large' : ''}`)
      out.push(`**Why:** ${c.why || '—'}  `)
      if (c.points !== undefined) out.push(`**Ambition ${sign(c.points)}:** ${c.signals.map(s => (s.pts ? `${sign(s.pts)} ${s.label}` : s.label)).join(' · ')}`)
      if (c.hunks.length) out.push('', '```diff', ...c.hunks.flatMap(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines]), '```')
      out.push('')
    }
  }
  return out.join('\n')
}
