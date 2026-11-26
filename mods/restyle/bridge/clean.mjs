// What the bridge and the driver keep of the values a page sends: only the fields in types/index.d.ts.
export const str = (v) => (typeof v === 'string' ? v : '')
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// Copy only the Pick fields, so a page cannot add fields. The caller checks that `tag` and `selector` are strings.
export function cleanPick(b) {
  const pick = {
    url: str(b.url).slice(0, 2000),
    tag: b.tag.slice(0, 80),
    selector: b.selector.slice(0, 2000),
    text: str(b.text).slice(0, 200),
    size: { width: num(b.size?.width), height: num(b.size?.height) },
    styles: {},
  }
  if (typeof b.role === 'string') pick.role = b.role
  if (b.styles && typeof b.styles === 'object') {
    for (const [k, v] of Object.entries(b.styles)) if (typeof v === 'string') pick.styles[k] = v
  }
  if (typeof b.component === 'string') pick.component = b.component
  if (b.source && typeof b.source.file === 'string' && typeof b.source.line === 'number') {
    pick.source = { file: b.source.file, line: b.source.line }
  }
  return pick
}

// At most 24 findings, each cut to its fields; a finding without a usable pick is dropped.
export const cleanFindings = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((f) => f && typeof f.rule === 'string' && f.pick && typeof f.pick.tag === 'string' && typeof f.pick.selector === 'string')
    .slice(0, 24)
    .map((f) => ({ rule: f.rule.slice(0, 40), detail: str(f.detail).slice(0, 200), pick: cleanPick(f.pick) }))
