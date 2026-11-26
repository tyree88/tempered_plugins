// restyle desktop: what the app does, with no Electron in it. main.mjs calls these from its IPC handlers.
// It uses the mod's own code: the driver audits, the catalog parses, compose.ts writes the prompt.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditUrl, loadRecipes, writeBoard } from '../bridge/audit-url.mjs'
import { signOf } from '../hooks/audit.ts'
import { composeFix } from '../hooks/compose.ts'

const MAX_PICKS = 8

// Text that a person typed in the window: one line, no control characters, at most 500 characters.
const typed = (v) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 500)

/** The text under a recipe's `## When` heading: when to use the recipe. */
export function whenOf(body) {
  const lines = body.split('\n')
  const at = lines.findIndex((l) => l.trim() === '## When')
  if (at < 0) return ''
  const end = lines.findIndex((l, n) => n > at && l.startsWith('## '))
  return lines.slice(at + 1, end < 0 ? undefined : end).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * @param opts `{ dir, audit, recipes }`: `dir` holds the app's two files (the board and the dismissed findings);
 *             `audit` and `recipes` take the place of the driver and the catalog in a test
 */
export function createCore({ dir, audit = auditUrl, recipes = loadRecipes() }) {
  const boardFile = join(dir, 'board.json')
  const dismissedFile = join(dir, 'dismissed.json')
  const byId = new Map(recipes.map((r) => [`${r.category}/${r.slug}`, r]))
  let running = false

  const read = (file, fallback) => {
    try {
      const v = JSON.parse(readFileSync(file, 'utf8'))
      return v && typeof v === 'object' ? v : fallback
    } catch {
      return fallback
    }
  }
  // Whole files only: a reader never sees half a file.
  const write = (file, value) => {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
  }
  const board = () => {
    const b = read(boardFile, null)
    return b && Array.isArray(b.cards) ? b : null
  }
  const cardOf = (b, id) => (typeof id === 'string' ? b?.cards.find((c) => c && c.id === id) : undefined)

  return {
    /** The catalog for the window: no recipe body, which only the prompt needs. */
    catalog: () => recipes.map((r) => ({ id: `${r.category}/${r.slug}`, name: r.name, category: r.category, appliesTo: r.appliesTo, when: whenOf(r.body), ...(r.patch ? { patch: r.patch } : {}) })),

    /** The board of the last audit, or null. */
    board,

    /** Audits the app at `url` and stores the board. One audit at a time. */
    async run(url, pages, onProgress) {
      if (running) throw new Error('An audit is running.')
      running = true
      try {
        const made = await audit([typed(url)], { pages: Number(pages) || 5, dismissed: read(dismissedFile, {}), recipes, onProgress })
        writeBoard(boardFile, made)
        return made
      } finally {
        running = false
      }
    },

    /**
     * Stores a reviewer's verdict on a card: `accept`, `dismiss` (needs a reason) or `open` (takes the verdict off).
     * A dismissed finding is also kept by origin, so the next audit of that app leaves it out.
     * @returns the card's verdict, or null for `open`
     */
    verdict(body) {
      const verdict = ['accept', 'dismiss', 'open'].includes(body?.verdict) ? body.verdict : null
      const reason = verdict === 'dismiss' ? typed(body.reason) : ''
      if (!verdict) throw new Error('Unknown verdict.')
      if (verdict === 'dismiss' && !reason) throw new Error('Give a reason to dismiss.')
      const b = board()
      // The card comes from the file. The window names it by id and adds nothing else to it.
      const card = cardOf(b, body.id)
      if (!card) throw new Error('This card is not on the board.')
      // Only recipes from the card's own shelf in the file, 8 at most. A dismiss has none.
      const onShelf = Array.isArray(card.shelf) ? card.shelf : []
      const picks = verdict === 'accept' && Array.isArray(body.picks) ? [...new Set(body.picks.filter((p) => typeof p === 'string' && onShelf.includes(p)))].slice(0, MAX_PICKS) : []
      if (verdict === 'open') delete card.verdict
      else card.verdict = { verdict, reason, comment: typed(body.comment), at: new Date().toISOString(), ...(picks.length ? { picks } : {}) }
      write(boardFile, b)

      const origin = typeof b.origin === 'string' ? b.origin : ''
      const selector = card.pick?.selector
      if (origin && typeof card.rule === 'string' && typeof selector === 'string') {
        const all = read(dismissedFile, {})
        const rest = (Array.isArray(all[origin]) ? all[origin] : []).filter((d) => d?.rule !== card.rule || d?.selector !== selector)
        all[origin] = verdict === 'dismiss' ? [...rest, { rule: card.rule, selector }] : rest
        write(dismissedFile, all)
      }
      return card.verdict ?? null
    },

    /** The prompt that fixes an accepted card, or '' when the card has no accept. */
    prompt(id) {
      const card = cardOf(board(), id)
      const sign = card && typeof card.rule === 'string' ? signOf(card.rule) : undefined
      if (!sign || card.verdict?.verdict !== 'accept' || !card.pick) return ''
      // The recipes that the reviewer put on the copy take the place of the sign's own recipe.
      const picked = (card.verdict.picks ?? []).map((p) => byId.get(p)).filter(Boolean)
      return composeFix({ rule: card.rule, detail: String(card.detail ?? ''), pick: card.pick }, sign, picked.length ? picked : byId.get(sign.recipe), card.verdict.comment)
    },
  }
}
