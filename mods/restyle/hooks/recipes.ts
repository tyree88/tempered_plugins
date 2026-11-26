// Parses one recipes/<category>/<slug>.md file (plan contract C4). Pure: no engine, no fs.
import type { Category, Kind, Recipe } from '../types/index.d.ts'

export type ParseResult = { ok: true; recipe: Recipe } | { ok: false; slug: string; reason: string }

const CATEGORIES: readonly string[] = ['motion', 'type', 'visual', 'effect']
const KINDS: readonly string[] = [
  'any', 'button', 'link', 'input', 'toggle', 'popover', 'menu',
  'tooltip', 'modal', 'list', 'text', 'heading', 'icon', 'image',
  'nav', 'slider', 'progress', 'card', 'carousel', 'background',
]
const KEYS = ['name', 'category', 'applies_to', 'source', 'added'] as const
const HEADINGS = ['## When', '## Values', '## Reference', '## Reduced motion']

function fail(slug: string, reason: string): ParseResult {
  return { ok: false, slug, reason }
}

// The patch of a recipe: CSS for one element, where `&` stands for the element. The board puts it on a copy of a real
// element, so the text is held to plain rules on `&`: it can load nothing and can style nothing but the element.
const BANNED: [RegExp, string][] = [
  [/@import/i, '@import'],
  [/url\s*\(/i, 'url('],
  [/image-set\s*\(/i, 'image-set('],
  [/</, '"<"'],
  [/\\/, 'a backslash'],
  [/\/\//, '"//"'],
  [/expression\s*\(|javascript:/i, 'script'],
]
// `&`, then pseudo-classes, pseudo-elements and attribute tests on the element itself. No combinator: nothing but the element.
const SELECTOR = /^&(?:::?[a-z-]+(?:\([a-z0-9\s:.,+\-[\]="']*\))?|\[[a-z-]+(?:[~|^$*]?="[^"\]]*")?\])*$/i
const MEDIA = /^@media\s+[a-z0-9\s():.,\-<>=/]+$/i
const KEYFRAMES = /^@keyframes\s+[a-z][a-z0-9-]*$/i
const STOPS = /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/i

// The `head { body }` blocks of a text at depth 0, or a reason when the braces do not pair or text stands alone.
function blocks(text: string): { head: string; body: string }[] | string {
  const out: { head: string; body: string }[] = []
  let depth = 0
  let start = 0
  let head = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{') {
      if (depth === 0) {
        head = text.slice(start, i).trim()
        start = i + 1
      }
      depth++
    } else if (c === '}') {
      depth--
      if (depth < 0) return 'a "}" has no "{"'
      if (depth === 0) {
        out.push({ head, body: text.slice(start, i) })
        start = i + 1
      }
    }
  }
  if (depth !== 0) return 'a "{" has no "}"'
  if (text.slice(start).trim() !== '') return `text outside a rule: "${text.slice(start).trim().slice(0, 40)}"`
  return out
}

const declarations = (body: string) => (/[{}&@]/.test(body) ? 'a rule holds something that is not a declaration' : undefined)

function plainRule(head: string, body: string): string | undefined {
  // Split the selector list at commas outside parentheses.
  const parts = head.split(/,(?![^(]*\))/).map(s => s.trim())
  const wrong = parts.find(s => !SELECTOR.test(s))
  if (wrong !== undefined) return `the selector "${wrong.slice(0, 40)}" is not the element itself: start it with "&" and use no combinator`
  return declarations(body)
}

/** Why a patch is refused, or nothing when it is plain rules on `&` (with `@media` around them, and `@keyframes`). */
export function checkPatch(css: string): string | undefined {
  if (css.length > 4000) return 'the patch is over 4000 characters'
  for (const [re, what] of BANNED) if (re.test(css)) return `the patch holds ${what}`
  const top = blocks(css.replace(/\/\*[\s\S]*?\*\//g, ' '))
  if (typeof top === 'string') return top
  if (top.length === 0) return 'the patch has no rule'
  for (const { head, body } of top) {
    if (KEYFRAMES.test(head)) {
      const steps = blocks(body)
      if (typeof steps === 'string') return steps
      for (const s of steps) {
        if (!STOPS.test(s.head)) return `"${s.head.slice(0, 40)}" is not a keyframe step`
        const bad = declarations(s.body)
        if (bad) return bad
      }
    } else if (MEDIA.test(head)) {
      const inner = blocks(body)
      if (typeof inner === 'string') return inner
      for (const r of inner) {
        const bad = plainRule(r.head, r.body)
        if (bad) return bad
      }
    } else if (head.startsWith('@')) return `the at-rule "${head.split(/\s/)[0]}" is not allowed`
    else {
      const bad = plainRule(head, body)
      if (bad) return bad
    }
  }
  return undefined
}

// The CSS of the `## Patch` section: the first fenced `css` block under the heading. Undefined: the recipe has none.
function patchOf(bodyLines: string[], after: number): { css?: string; reason?: string } {
  const at = bodyLines.findIndex(l => l.trim() === '## Patch')
  if (at < 0) return {}
  if (at < after) return { reason: 'the heading "## Patch" must come after "## Reduced motion"' }
  const open = bodyLines.findIndex((l, n) => n > at && l.trim() === '```css')
  const close = bodyLines.findIndex((l, n) => n > open && l.trim() === '```')
  if (open < 0 || close < 0) return { reason: 'the "## Patch" section has no fenced css block' }
  const css = bodyLines.slice(open + 1, close).join('\n').trim()
  const bad = checkPatch(css)
  return bad ? { reason: `bad patch: ${bad}` } : { css }
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function parseRecipe(slug: string, category: string, text: string): ParseResult {
  if (!/^[a-z0-9-]+$/.test(slug)) return fail(slug, `bad slug "${slug}"`)
  if (!CATEGORIES.includes(category)) return fail(slug, `bad folder category "${category}"`)

  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return fail(slug, 'no frontmatter: first line is not ---')
  const end = lines.indexOf('---', 1)
  if (end < 0) return fail(slug, 'frontmatter is not closed with ---')

  const fields: Record<string, string> = {}
  for (const raw of lines.slice(1, end)) {
    const line = raw.trim()
    if (line === '') continue
    const colon = line.indexOf(':')
    if (colon <= 0) return fail(slug, `frontmatter line is not key: value: "${line}"`)
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  for (const key of KEYS) {
    if (!fields[key]) return fail(slug, `missing frontmatter key "${key}"`)
  }
  const f = fields as Record<(typeof KEYS)[number], string>

  if (!CATEGORIES.includes(f.category)) return fail(slug, `bad category "${f.category}"`)
  if (f.category !== category) {
    return fail(slug, `category "${f.category}" differs from folder "${category}"`)
  }
  const appliesTo = f.applies_to.split(',').map((w) => w.trim())
  const unknown = appliesTo.find((w) => !KINDS.includes(w))
  if (unknown !== undefined) return fail(slug, `unknown applies_to word "${unknown}"`)
  if (!validDate(f.added)) return fail(slug, `bad added date "${f.added}"`)

  const bodyLines = lines.slice(end + 1)
  let at = -1
  for (const heading of HEADINGS) {
    const i = bodyLines.findIndex((l, n) => n > at && l.trim() === heading)
    if (i < 0) return fail(slug, `missing heading "${heading}" (or out of order)`)
    at = i
  }
  const patch = patchOf(bodyLines, at)
  if (patch.reason) return fail(slug, patch.reason)
  // The patch is for the board. The prompt gets the recipe without it: `&` means nothing in a project's source.
  const patchAt = bodyLines.findIndex(l => l.trim() === '## Patch')
  if (patchAt >= 0) bodyLines.length = patchAt

  return {
    ok: true,
    recipe: {
      slug,
      name: f.name,
      category: f.category as Category,
      appliesTo: appliesTo as Kind[],
      source: f.source,
      added: f.added,
      body: bodyLines.join('\n').trim(),
      ...(patch.css ? { patch: patch.css } : {}),
    },
  }
}
