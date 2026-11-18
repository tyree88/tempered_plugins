import type { BridgeLine, Kind, Pick, Recipe } from '../types/index.d.ts'

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
}

/** The kinds a pick is, most specific first; `text` when it shows text; always ends with `any`. */
export function kindsOf(pick: Pick): Kind[] {
  const out = [...(BY_TAG[pick.tag.toLowerCase()] ?? []), ...(pick.role ? (BY_ROLE[pick.role.toLowerCase()] ?? []) : [])]
  if (pick.text.trim()) out.push('text')
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
  if (m.type === 'ready' && typeof m.port === 'number' && typeof m.token === 'string') return { type: 'ready', port: m.port, token: m.token }
  if (m.type === 'hello' && typeof m.url === 'string') return { type: 'hello', url: m.url }
  const p = m.type === 'pick' && m.pick && typeof m.pick === 'object' ? (m.pick as Record<string, unknown>) : undefined
  if (!p || typeof p.tag !== 'string' || typeof p.selector !== 'string') return undefined
  const size = p.size && typeof p.size === 'object' ? (p.size as Record<string, unknown>) : {}
  const styles = p.styles && typeof p.styles === 'object' ? Object.entries(p.styles).filter((x): x is [string, string] => typeof x[1] === 'string') : []
  const src = p.source && typeof p.source === 'object' ? (p.source as Record<string, unknown>) : undefined
  return {
    type: 'pick',
    pick: {
      url: typeof p.url === 'string' ? p.url : '',
      tag: p.tag,
      selector: p.selector,
      text: typeof p.text === 'string' ? p.text.slice(0, 200) : '',
      ...(typeof p.role === 'string' ? { role: p.role } : {}),
      size: { width: Number(size.width) || 0, height: Number(size.height) || 0 },
      styles: Object.fromEntries(styles),
      ...(typeof p.component === 'string' ? { component: p.component } : {}),
      ...(src && typeof src.file === 'string' && typeof src.line === 'number' ? { source: { file: src.file, line: src.line } } : {}),
    },
  }
}

/** Matches first (own kind over `any`), then by category, then by name. */
export function rank(recipes: readonly Recipe[], pick: Pick | undefined): Recipe[] {
  const kinds = pick ? kindsOf(pick) : []
  return recipes
    .map(recipe => ({ recipe, s: score(recipe, kinds) }))
    .sort((a, b) => b.s - a.s || a.recipe.category.localeCompare(b.recipe.category) || a.recipe.name.localeCompare(b.recipe.name))
    .map(x => x.recipe)
}
