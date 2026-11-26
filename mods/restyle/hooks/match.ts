import type { BridgeLine, Card, Finding, Kind, Pick, Recipe } from '../types/index.d.ts'

const BY_TAG: Record<string, Kind[]> = {
  button: ['button'],
  summary: ['button'],
  a: ['link'],
  input: ['input'],
  textarea: ['input'],
  select: ['input'],
  dialog: ['modal'],
  menu: ['menu'],
  ul: ['list'],
  ol: ['list'],
  dl: ['list'],
  li: ['list'],
  h1: ['heading'],
  h2: ['heading'],
  h3: ['heading'],
  h4: ['heading'],
  h5: ['heading'],
  h6: ['heading'],
  svg: ['icon'],
  img: ['image'],
  picture: ['image'],
  video: ['image'],
  canvas: ['image'],
  nav: ['nav'],
  progress: ['progress'],
  meter: ['progress'],
  article: ['card'],
  body: ['background'],
  main: ['background'],
  section: ['background'],
}

const BY_ROLE: Record<string, Kind[]> = {
  button: ['button'],
  link: ['link'],
  textbox: ['input'],
  searchbox: ['input'],
  combobox: ['input'],
  switch: ['toggle'],
  checkbox: ['toggle'],
  radio: ['toggle'],
  dialog: ['modal', 'popover'],
  alertdialog: ['modal'],
  menu: ['menu', 'popover'],
  menubar: ['menu'],
  menuitem: ['menu'],
  listbox: ['list', 'popover'],
  tooltip: ['tooltip', 'popover'],
  list: ['list'],
  listitem: ['list'],
  heading: ['heading'],
  img: ['image'],
  navigation: ['nav'],
  tablist: ['nav'],
  tab: ['nav'],
  slider: ['slider'],
  progressbar: ['progress'],
}

/**
 * The kinds a pick is, most specific first; always ends with `any`.
 * `text` is for an element that is running text: it shows text and has no role of its own (a paragraph, a span).
 * A button with a label is a button, and a heading is a heading: a recipe for running text (hyphenation, small
 * caps, link underlines) does not fit them unless it names them too.
 */
export function kindsOf(pick: Pick): Kind[] {
  const out = [...(BY_TAG[pick.tag.toLowerCase()] ?? []), ...(pick.role ? (BY_ROLE[pick.role.toLowerCase()] ?? []) : [])]
  if (pick.text.trim() && out.length === 0) out.push('text')
  return [...new Set<Kind>([...out.filter(k => k !== 'any'), 'any'])]
}

/** 2: the recipe names one of the pick's own kinds; 1: it applies to `any`; 0: no match or no pick. */
export function score(recipe: Recipe, kinds: readonly Kind[]): number {
  if (recipe.appliesTo.some(k => k !== 'any' && kinds.includes(k))) return 2
  return kinds.length && recipe.appliesTo.includes('any') ? 1 : 0
}

// One stdout line of the bridge, checked field by field: a pick's values come from a web page.
export function parseLine(line: string): BridgeLine | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const m = raw as Record<string, unknown>
  if (m.type === 'ready' && typeof m.port === 'number' && typeof m.token === 'string') {
    return { type: 'ready', port: m.port, token: m.token, ...(typeof m.board === 'string' && m.board ? { board: m.board } : {}) }
  }
  if (m.type === 'hello' && typeof m.url === 'string') return { type: 'hello', url: m.url }
  if (m.type === 'audit' && typeof m.url === 'string' && Array.isArray(m.findings)) {
    const findings: Finding[] = []
    for (const raw of m.findings as unknown[]) {
      const f = findingOf(raw)
      if (f) findings.push(f)
    }
    return { type: 'audit', url: m.url, findings }
  }
  // The board's verdict: the text in it is what a person typed on a web page.
  if (m.type === 'verdict' && typeof m.id === 'string' && (m.verdict === 'accept' || m.verdict === 'dismiss')) {
    const picks = m.verdict === 'accept' && Array.isArray(m.picks) ? (m.picks as unknown[]).filter((p): p is string => typeof p === 'string' && /^[a-z]+\/[a-z0-9-]+$/.test(p)).slice(0, 8) : []
    return { type: 'verdict', id: m.id.slice(0, 64), verdict: m.verdict, reason: cut(m.reason, 500), comment: cut(m.comment, 500), at: cut(m.at, 40), ...(picks.length ? { picks } : {}) }
  }
  // The driver's lines (bridge/audit-url.mjs).
  if ((m.type === 'progress' || m.type === 'error') && typeof m.text === 'string') return { type: m.type, text: m.text.slice(0, 300) }
  if (m.type === 'board' && Array.isArray(m.cards)) {
    const cards: Card[] = []
    for (const raw of m.cards as unknown[]) {
      const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      const finding = findingOf(c.finding)
      if (!finding || typeof c.id !== 'string') continue
      cards.push({ id: c.id.slice(0, 64), page: cut(c.page, 2000), widths: Array.isArray(c.widths) ? c.widths.filter((w): w is number => typeof w === 'number') : [], finding })
    }
    return { type: 'board', cards }
  }
  const pick = m.type === 'pick' ? pickOf(m.pick) : undefined
  return pick ? { type: 'pick', pick } : undefined
}

const cut = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

function findingOf(raw: unknown): Finding | undefined {
  const f = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pick = pickOf(f.pick)
  return pick && typeof f.rule === 'string' ? { rule: f.rule, detail: cut(f.detail, 200), pick } : undefined
}

function pickOf(raw: unknown): Pick | undefined {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
  if (!p || typeof p.tag !== 'string' || typeof p.selector !== 'string') return undefined
  const size = p.size && typeof p.size === 'object' ? (p.size as Record<string, unknown>) : {}
  const styles = p.styles && typeof p.styles === 'object' ? Object.entries(p.styles).filter((x): x is [string, string] => typeof x[1] === 'string') : []
  const src = p.source && typeof p.source === 'object' ? (p.source as Record<string, unknown>) : undefined
  return {
    url: typeof p.url === 'string' ? p.url : '',
    tag: p.tag,
    selector: p.selector,
    text: typeof p.text === 'string' ? p.text.slice(0, 200) : '',
    ...(typeof p.role === 'string' ? { role: p.role } : {}),
    size: { width: Number(size.width) || 0, height: Number(size.height) || 0 },
    styles: Object.fromEntries(styles),
    ...(typeof p.component === 'string' ? { component: p.component } : {}),
    ...(src && typeof src.file === 'string' && typeof src.line === 'number' ? { source: { file: src.file, line: src.line } } : {}),
  }
}

/**
 * The shelf of a board card: the recipes that fit the element, in rank order.
 * `fit`: those with a patch, which the board can show on a copy of the element (12 at most).
 * `more`: those of the element's own kind with no patch, because they add markup or need a script (6 at most).
 * `fixId` is the `<category>/<slug>` of the recipe that fixes the card's finding: it comes first, fit or not.
 */
export function shelf(recipes: readonly Recipe[], pick: Pick, fixId?: string): { fit: Recipe[]; more: Recipe[] } {
  const kinds = kindsOf(pick)
  const isFix = (r: Recipe) => fixId !== undefined && `${r.category}/${r.slug}` === fixId
  const ranked = rank(recipes, pick).sort((a, b) => Number(isFix(b)) - Number(isFix(a))) // a stable sort: the rest keep their rank
  return {
    fit: ranked.filter(r => r.patch !== undefined && (score(r, kinds) > 0 || isFix(r))).slice(0, 12),
    more: ranked.filter(r => r.patch === undefined && (score(r, kinds) === 2 || isFix(r))).slice(0, 6),
  }
}

// Details first, effects last: an effect changes the markup, so it is the bigger step.
const ORDER = ['motion', 'type', 'visual', 'effect']

/** Matches first (own kind over `any`), then by category, then by name. */
export function rank(recipes: readonly Recipe[], pick: Pick | undefined): Recipe[] {
  const kinds = pick ? kindsOf(pick) : []
  return recipes
    .map(recipe => ({ recipe, s: score(recipe, kinds) }))
    .sort((a, b) => b.s - a.s || ORDER.indexOf(a.recipe.category) - ORDER.indexOf(b.recipe.category) || a.recipe.name.localeCompare(b.recipe.name))
    .map(x => x.recipe)
}
