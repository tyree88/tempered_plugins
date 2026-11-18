// Parses one recipes/<category>/<slug>.md file (plan contract C4). Pure: no engine, no fs.
import type { Category, Kind, Recipe } from '../types/index.d.ts'

export type ParseResult = { ok: true; recipe: Recipe } | { ok: false; slug: string; reason: string }

const CATEGORIES: readonly string[] = ['motion', 'type']
const KINDS: readonly string[] = [
  'any', 'button', 'link', 'input', 'toggle', 'popover', 'menu',
  'tooltip', 'modal', 'list', 'text', 'heading', 'icon', 'image',
]
const KEYS = ['name', 'category', 'applies_to', 'source', 'added'] as const
const HEADINGS = ['## When', '## Values', '## Reference', '## Reduced motion']

function fail(slug: string, reason: string): ParseResult {
  return { ok: false, slug, reason }
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
    },
  }
}
