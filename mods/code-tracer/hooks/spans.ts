import type { Span } from '../types'

// One hunk on one path as captured: `newStart` is a line of the file as it was after the edit.
export type Placed = { changeId: string; agent: string; order: number; newStart: number; oldLines: number; newLines: number; span: Span }

export type Rebased = {
  spans: Map<string, Span[]> // change id → its hunks' spans at current lines
  churn: Map<string, number> // change id → earlier same-agent hunks it intersected
  overlaps: { a: string; b: string; span: Span }[] // intersections of two agents' rebased spans
}

const meet = (x: Span, y: Span): Span | undefined => (x.from <= y.to && y.from <= x.to ? { from: Math.max(x.from, y.from), to: Math.min(x.to, y.to) } : undefined)

// Brings every span on one path to the file's current lines. For each hunk H in time order, every later hunk L
// either sits above it (shift by L's delta), deletes over its start (snap `from`), intersects it (churn for the same
// agent, otherwise noted; shift `to`), or leaves it alone. Stored spans stay as captured; this runs at draw time.
export function rebasePath(hunks: readonly Placed[]): Rebased {
  const sorted = [...hunks].sort((a, b) => a.order - b.order)
  const spans = new Map<string, Span[]>()
  const churn = new Map<string, number>()
  const placed: { agent: string; changeId: string; span: Span }[] = []
  sorted.forEach((H, i) => {
    let from = H.span.from
    let to = H.span.to
    for (const L of sorted.slice(i + 1)) {
      const delta = L.newLines - L.oldLines
      const isInsertion = L.oldLines === 0
      const oldEnd = L.newStart + Math.max(L.oldLines, 1) - 1
      if (L.newLines === 0 && L.oldLines > 0 && L.newStart <= from && from <= oldEnd) {
        from = L.newStart
        to = Math.max(from, to + delta)
        continue
      }
      if (L.newStart < from || (L.newStart <= from && isInsertion)) {
        from += delta
        to += delta
        continue
      }
      if (L.newStart <= to && from <= oldEnd) {
        if (L.agent === H.agent && L.changeId !== H.changeId) churn.set(L.changeId, (churn.get(L.changeId) ?? 0) + 1)
        to = Math.max(from, to + delta)
      }
    }
    const span = { from, to }
    spans.set(H.changeId, [...(spans.get(H.changeId) ?? []), span])
    placed.push({ agent: H.agent, changeId: H.changeId, span })
  })
  const overlaps: Rebased['overlaps'] = []
  placed.forEach((x, i) =>
    placed.slice(i + 1).forEach(y => {
      if (x.agent === y.agent) return
      const m = meet(x.span, y.span)
      if (m) overlaps.push({ a: x.changeId, b: y.changeId, span: m })
    }),
  )
  return { spans, churn, overlaps }
}

export const intersects = (x: Span, y: Span) => meet(x, y) !== undefined
