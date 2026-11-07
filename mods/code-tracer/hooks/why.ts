import type { WhySource } from '../types'

export type Msg = { role: 'user' | 'assistant'; text: string; toolUses: { tool_use_id: string }[] }

const MAX = 160

// First sentence of `text`, cut to MAX chars on a word boundary.
export function firstSentence(text: string): string {
  const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim()
  const m = clean.match(/^(.+?[.!?])(\s|$)/)
  const s = (m?.[1] ?? clean).trim()
  if (s.length <= MAX) return s
  const cut = s.slice(0, MAX)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}…`
}

// Blocks a host adds to a user row (`<system-reminder>…</system-reminder>` and the like) are not the person's words.
const stripBlocks = (s: string) => s.replace(/<([a-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/gi, ' ').trim()

// The why of a tool use: the assistant text of the model message that holds it; else the spawn description (a
// subagent); else the latest user prompt before the call (main); else none.
// The transcript stores each block as its own row: a message is its text row (when it has one; some have none),
// then one row per tool use, then the user rows with the results. So the message's text is the nearest assistant
// text behind the tool row with no user row between; past a user row lies an earlier message, whose sentence
// would be a wrong why. The user's prompt is the nearest earlier user row with text of its own.
export function whyOf(messages: readonly Msg[], toolUseId: string, fallback: string): { why: string; whySource: WhySource } {
  const i = messages.findIndex(m => m.role === 'assistant' && m.toolUses.some(t => t.tool_use_id === toolUseId))
  let text = i >= 0 ? (messages[i]?.text ?? '').trim() : ''
  for (let j = i - 1; j >= 0 && !text && messages[j]!.role === 'assistant'; j--) text = messages[j]!.text.trim()
  if (text) return { why: firstSentence(text), whySource: 'captured' }
  if (fallback.trim()) return { why: firstSentence(fallback), whySource: 'spawn' }
  for (let j = i - 1; j >= 0; j--) {
    const m = messages[j]!
    const prompt = m.role === 'user' ? stripBlocks(m.text) : ''
    if (prompt) return { why: firstSentence(prompt), whySource: 'prompt' }
  }
  return { why: '', whySource: 'none' }
}
