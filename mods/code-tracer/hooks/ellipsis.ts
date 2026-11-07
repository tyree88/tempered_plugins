// Middle ellipsis for paths. Keeps the first segment and at least the last `tail` segments; when the budget is too
// short, in order: drop the first segment, ellipsize inside the penultimate segment, ellipsize inside the file name
// keeping its extension. Widths count one cell per character (`…` assumed one cell).
export function ellipsize(path: string, budget: number, tail = 2): string {
  if (path.length <= budget) return path
  const segs = path.split('/')
  const file = segs.at(-1) ?? path
  if (segs.length > tail + 1) {
    const kept = segs.slice(-tail).join('/')
    const withHead = `${segs[0]}/…/${kept}`
    if (withHead.length <= budget) return withHead
    const headless = `…/${kept}`
    if (headless.length <= budget) return headless
  } else if (segs.length > 1) {
    const headless = `…/${segs.slice(1).join('/')}`
    if (headless.length <= budget) return headless
  }
  if (segs.length >= 2) {
    const pen = segs.at(-2) ?? ''
    const room = budget - file.length - 4 // `…/` + `…/`
    if (room >= 2) return `…/${pen.slice(0, room - 1)}…/${file}`
  }
  const ext = file.match(/\.[^.]+$/)?.[0] ?? ''
  const base = file.slice(0, file.length - ext.length)
  const prefix = segs.length > 1 ? '…/' : ''
  const room = budget - prefix.length - ext.length - 1
  if (room >= 1) return `${prefix}${base.slice(0, room)}…${ext}`
  return `${prefix}${file}`.slice(0, Math.max(1, budget))
}

// The same for several rows drawn together: two distinct paths that would render alike both keep one more
// trailing segment, within the same step order, until they differ or run out of segments.
export function ellipsizeAll(paths: readonly string[], budget: number): string[] {
  const tails = paths.map(() => 2)
  for (let round = 0; round < 8; round++) {
    const out = paths.map((p, i) => ellipsize(p, budget, tails[i] ?? 2))
    let widened = false
    out.forEach((s, i) => {
      const twin = out.findIndex((t, j) => j !== i && t === s && paths[j] !== paths[i])
      if (twin >= 0 && (tails[i] ?? 2) < (paths[i] ?? '').split('/').length) {
        tails[i] = (tails[i] ?? 2) + 1
        widened = true
      }
    })
    if (!widened) return out
  }
  return paths.map((p, i) => ellipsize(p, budget, tails[i] ?? 2))
}
