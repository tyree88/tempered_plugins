import type { Agent, Change } from '../types'
import { range } from './capture.ts'
import { sessionScore } from './score.ts'

// A markdown report: one section per agent, one block per change with where, why, signals and the hunk. A PR body seed.
export function toMarkdown(repo: string, branch: string | undefined, changes: readonly Change[], agents: readonly Agent[]): string {
  const out: string[] = [`# Code changes · ${repo}${branch ? ` ⎇ ${branch}` : ''}`, '']
  const s = sessionScore(changes)
  out.push(`${changes.length} changes · ${new Set(changes.map(c => c.path)).size} files${s === null ? '' : ` · session ambition ${s}/10`}`, '')
  const ids = ['main', ...agents.map(a => a.agentId)].filter(id => changes.some(c => (c.agentId ?? 'main') === id))
  for (const id of ids) {
    const a = agents.find(x => x.agentId === id)
    out.push(`## ${id === 'main' ? 'main' : `${a?.type ?? id}${a?.description ? ` — ${a.description}` : ''}`}${a?.model ? ` (${a.model})` : ''}`, '')
    for (const c of changes.filter(c => (c.agentId ?? 'main') === id)) {
      const r = range(c.hunks)
      out.push(`### ${c.path}:${r.from}${r.to > r.from ? `-${r.to}` : ''} · +${c.additions} −${c.deletions} · ${c.score}/10`)
      out.push(`**Why:** ${c.why || '—'}  `)
      if (c.signals.length) out.push(`**Signals:** ${c.signals.join(', ')}`)
      out.push('', '```diff', ...c.hunks.flatMap(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines]), '```', '')
    }
  }
  return out.join('\n')
}
