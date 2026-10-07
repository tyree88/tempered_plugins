export type Kind = 'win' | 'pitfall'
export type Reason = 'explicit' | 'frustration' | 'repeated correction' | 'praise'
export type Hit = { kind: Kind; reason: Reason }
export type Drafts = { win: number; pitfall: number }

// Bare "log this" counts only as a whole ask (end of clause), so "log this error to sentry" is not one; also "log this as a win/pitfall", "add this to pitfalls/learnings".
const LOG_PITFALL =
  /\b(log this(?=(?:\s+(?:please|pls))?\s*(?:[.!,;:]|$))|log this (?:as an? )?(?:pitfall|lesson|mistake)|(?:log|add) (?:this |that |it )?(?:\w+ )?(?:to|in) (?:the )?pitfalls|remember this lesson)\b/i
const LOG_WIN = /\b(log this (?:as an? )?win|(?:log|add) (?:this |that |it )?(?:\w+ )?(?:to|in) (?:the )?learnings|remember this worked)\b/i
// Excludes: "why did you choose X?" (a rationale question), "the second time I click it..." (only "this is the second time" complains), "run it again" (only a sentence-leading "again, use X" corrects).
const FRUSTRATION =
  /\b(i (?:(?:already|just) (?:told|said|asked)|told you|asked you (?:to|not))|no,? i (?:said|meant)|still (?:wrong|broken|not (?:working|right|fixed)|fails|failing|crashing|erroring|doesn['’]?t work|isn['’]?t working)|(?:this is|that['’]?s|it['’]?s|for) the (second|third|2nd|3rd|fourth) time|why (did|would) you(?! (?:choose|pick|decide|opt|select|prefer|recommend|use|go (?:with|for))\b)|not what i (?:asked|wanted|said|meant)|ugh+)\b|(?:^\s*|[.!?]\s+|\bbut\s+)again\b[,.!]?\s+(?:i|please|no|use|do)\b/i
// Excludes: "exactly 3 retries" (only a standalone "exactly" or "exactly what I wanted" praises), "pixel perfect", "love it if/when/to ...".
const PRAISE =
  /(?<!pixel[ -])\b(perfect|nailed it|love (this|it)\b(?! (?:if|when|to)\b)|this is great|that['’]?s great|yes,? (this|that) is what i wanted|exactly what i (?:wanted|needed|meant))\b|^\W*(?:yes,?\s+)?exactly\s*(?:[.!,]|$)/i
const THANKS_ONLY = /^\s*(thanks|thank you|ok|okay|cool|nice)[\s.!]*$/i
const NEGATION = /^(not|never|isnt|wasnt|dont|doesnt|didnt|arent)$|n['’]t$/
// Excludes: REST verbs and file names, and caps words that are under 40% of all words (pasted logs, SQL, env names).
const ACRONYMS = new Set(['JSON', 'HTML', 'HTTP', 'HTTPS', 'README', 'TODO', 'YAML', 'TOML', 'UUID', 'CORS', 'CRUD', 'NULL', 'TRUE', 'FALSE', 'ASAP', 'NOTE', 'POST', 'PATCH', 'DELETE', 'HEAD', 'CHANGELOG', 'LICENSE'])
const STOP = new Set(['the', 'and', 'for', 'you', 'this', 'that', 'with', 'are', 'was', 'can', 'please', 'just', 'not', 'but', 'use', 'all', 'any', 'from', 'into', 'have', 'has', 'its', 'our', 'your'])
const OVERLAP = 0.8
const MIN_WORDS = 5

const shouting = (text: string) => {
  if (!/[a-z]/.test(text)) return 0
  const caps = (text.match(/\b[A-Z]{4,}\b/g) ?? []).filter(w => !ACRONYMS.has(w)).length
  const all = (text.match(/[A-Za-z]+/g) ?? []).length
  return caps / all >= 0.4 ? caps : 0
}

// Short tokens with a digit are kept, so "page 2" and "page 3" differ.
export const words = (text: string) =>
  new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w)))

const overlap = (a: Set<string>, b: Set<string>) => {
  let shared = 0
  for (const w of a) if (b.has(w)) shared += 1
  return shared / (a.size + b.size - shared)
}

const isPraise = (text: string) => {
  const m = PRAISE.exec(text)
  if (!m || THANKS_ONLY.test(text)) return false
  const before = text.slice(0, m.index).toLowerCase().split(/\s+/).filter(Boolean).slice(-2)
  // A trailing "?" vetoes praise only when the praise is not the opening words ("perfect, can you now add tests?" is a win).
  if (text.trim().endsWith('?') && text.slice(0, m.index).trim().length >= 4) return false
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
