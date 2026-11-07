import type { Change, Improvement, ImprovementKind } from '../types'
import { namesFile } from './score.ts'

export const KINDS: readonly ImprovementKind[] = ['tests', 'callers', 'scope', 'cleanup']
export const MAX_CANDIDATES = 12
export const MAX_SUGGESTION = 160

// Changes worth a second look: scored, not reverted, weak on evidence, and not yet reviewed by the reflector.
export function candidates(changes: readonly Change[], improvements: readonly Improvement[]): Change[] {
  const seen = new Set(improvements.map(i => i.changeId))
  const weak = (c: Change) =>
    (c.points ?? 0) <= 2 ||
    c.signals.some(s => /^(no tests|cosmetic|reach unknown|churn ×|✗ tested)/.test(s.label) || /^imported by [0-2]$/.test(s.label))
  return changes.filter(c => c.points !== undefined && !c.isReverted && !c.isDeleted && !c.isTooLarge && !seen.has(c.id) && weak(c)).slice(-MAX_CANDIDATES)
}

export const SYSTEM = [
  'You review code changes an AI coding session made and name the one improvement each still needs.',
  'Kinds: tests (a test is missing or thin), callers (a caller, importer or config was not updated), scope (the change is partial or cosmetic for its stated why), cleanup (churn, duplication or leftovers).',
  'Answer with a JSON array only: [{"changeId":"...","kind":"tests|callers|scope|cleanup","suggestion":"imperative sentence, under 140 characters"}].',
  'At most one item per changeId, only ids you were given. Skip a change that needs nothing. Return [] when none does.',
].join('\n')

// One compact block per candidate: id, path, points, signals, why, the first lines of the diff.
export function buildPrompt(cands: readonly Change[]): string {
  return cands
    .map(c =>
      [
        `changeId: ${c.id}`,
        `path: ${c.path}`,
        `ambition: ${c.points ?? 0} (${c.signals.map(s => s.label).join(', ') || 'no signals'})`,
        `why: ${c.why || '—'}`,
        'diff:',
        ...c.hunks
          .flatMap(h => h.lines)
          .filter(l => l.startsWith('+') || l.startsWith('-'))
          .slice(0, 8)
          .map(l => `  ${l.slice(0, 160)}`),
      ].join('\n'),
    )
    .join('\n\n')
}

export type Finding = { changeId: string; kind: ImprovementKind; suggestion: string }

// The model's reply → findings: the first JSON array, items with a known id and kind, one per change, clipped.
export function parseFindings(text: string, cands: readonly Change[]): Finding[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const ids = new Set(cands.map(c => c.id))
  const out = new Map<string, Finding>()
  for (const item of raw) {
    const f = item as Partial<Finding> | null
    if (!f || typeof f.changeId !== 'string' || typeof f.suggestion !== 'string' || !ids.has(f.changeId) || out.has(f.changeId)) continue
    if (!KINDS.includes(f.kind as ImprovementKind)) continue
    const suggestion = f.suggestion.replace(/\s+/g, ' ').trim()
    if (!suggestion) continue
    out.set(f.changeId, { changeId: f.changeId, kind: f.kind as ImprovementKind, suggestion: suggestion.length > MAX_SUGGESTION ? `${suggestion.slice(0, MAX_SUGGESTION - 1)}…` : suggestion })
  }
  return [...out.values()]
}

// A finding closes when a later change touches its target: the same path, or a change that names the target file.
export function closeOn(improvements: readonly Improvement[], later: Change, all: readonly Change[]): Improvement[] {
  return improvements.map(i => {
    if (i.closedAt !== undefined || later.id === i.changeId || later.at < i.at) return i
    const target = all.find(c => c.id === i.changeId)
    const touches = later.path === i.path || (target !== undefined && namesFile(later, target))
    return touches ? { ...i, closedAt: later.at, closedBy: later.id } : i
  })
}

export const openOnes = (improvements: readonly Improvement[]) => improvements.filter(i => i.closedAt === undefined)

// The system-prompt section the next step reads. Empty string when nothing is open.
export function composeSection(open: readonly Improvement[]): string {
  if (!open.length) return ''
  const lines = open.slice(0, 12).map(i => `- [${i.kind}] ${i.path}: ${i.suggestion} (change ${i.changeId})`)
  if (open.length > 12) lines.push(`- and ${open.length - 12} more`)
  return ['Pending improvements from the code-tracer reflector, a background review of the code changes this session made so far. Act on one when it fits the current task; otherwise leave it.', ...lines].join('\n')
}
