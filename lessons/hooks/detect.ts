export type Kind = 'win' | 'pitfall'
export type Reason = 'explicit' | 'frustration' | 'repeated correction' | 'praise'
export type Hit = { kind: Kind; reason: Reason }
export type Drafts = { win: number; pitfall: number }

const LOG_PITFALL = /\b(log this|add (this )?to pitfalls|remember this lesson)\b(?! win)/i
const LOG_WIN = /\b(log this win|add (this )?to learnings|remember this worked)\b/i
const FRUSTRATION =
  /\b(i (already|just) (told|said|asked)|still (wrong|broken|not (working|right|fixed))|(second|third|2nd|3rd|fourth) time|why (did|would) you|not what i (asked|wanted|said)|ugh+|again[,.!]? (i|please|no|use|do))\b/i
const PRAISE = /\b(perfect|exactly|nailed it|love (this|it)|this is great|that['’]?s great|yes,? (this|that) is what i wanted)\b/i
const THANKS_ONLY = /^\s*(thanks|thank you|ok|okay|cool|nice)[\s.!]*$/i
const NEGATION = /^(not|never|isnt|wasnt|dont|doesnt|didnt|arent)$|n['’]t$/
const ACRONYMS = new Set(['JSON', 'HTML', 'HTTP', 'HTTPS', 'README', 'TODO', 'YAML', 'TOML', 'UUID', 'CORS', 'CRUD', 'NULL', 'TRUE', 'FALSE', 'ASAP', 'NOTE'])
const STOP = new Set(['the', 'and', 'for', 'you', 'this', 'that', 'with', 'are', 'was', 'can', 'please', 'just', 'not', 'but', 'use', 'all', 'any', 'from', 'into', 'have', 'has', 'its', 'our', 'your'])
const OVERLAP = 0.6
const MIN_WORDS = 4

const shouting = (text: string) =>
  /[a-z]/.test(text) ? (text.match(/\b[A-Z]{4,}\b/g) ?? []).filter(w => !ACRONYMS.has(w)).length : 0

export const words = (text: string) =>
  new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))

const overlap = (a: Set<string>, b: Set<string>) => {
  let shared = 0
  for (const w of a) if (b.has(w)) shared += 1
  return shared / (a.size + b.size - shared)
}

const isPraise = (text: string) => {
  if (text.trim().endsWith('?') || THANKS_ONLY.test(text)) return false
  const m = PRAISE.exec(text)
  if (!m) return false
  const before = text.slice(0, m.index).toLowerCase().split(/\s+/).filter(Boolean).slice(-2)
  return !before.some(w => NEGATION.test(w.replace(/[^a-z'’]/g, '')))
}

// One typed prompt → a win/pitfall signal or null. Explicit asks first; then pitfall rules beat praise.
export function detect(text: string, recent: readonly string[]): Hit | null {
  if (LOG_PITFALL.test(text)) return { kind: 'pitfall', reason: 'explicit' }
  if (LOG_WIN.test(text)) return { kind: 'win', reason: 'explicit' }
  if (FRUSTRATION.test(text) || shouting(text) >= 2) return { kind: 'pitfall', reason: 'frustration' }
  const mine = words(text)
  if (mine.size >= MIN_WORDS && recent.some(r => {
    const theirs = words(r)
    return theirs.size >= MIN_WORDS && overlap(mine, theirs) >= OVERLAP
  })) return { kind: 'pitfall', reason: 'repeated correction' }
  if (isPraise(text)) return { kind: 'win', reason: 'praise' }
  return null
}

export const isYes = (text: string) => /^\s*(y|yes)\b/i.test(text)

// Drafts the skills showed in one answer; only when they asked "Log it? y/n".
export function countDrafts(answer: string): Drafts {
  if (!answer.includes('Log it? y/n')) return { win: 0, pitfall: 0 }
  return {
    win: (answer.match(/Win draft/g) ?? []).length,
    pitfall: (answer.match(/Pitfall draft/g) ?? []).length,
  }
}
