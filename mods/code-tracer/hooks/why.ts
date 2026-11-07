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

// The why of a tool use: the assistant text of the message that holds it, else the previous assistant text,
// else the spawn description. A bare tool-only message has no text, hence the look-back of one.
export function whyOf(messages: readonly Msg[], toolUseId: string, fallback: string): { why: string; whySource: WhySource } {
  const i = messages.findIndex(m => m.role === 'assistant' && m.toolUses.some(t => t.tool_use_id === toolUseId))
  const own = i >= 0 ? messages[i]?.text ?? '' : ''
  const back = i > 0 ? messages[i - 1] : undefined
  const text = own.trim() || (back?.role === 'assistant' ? back.text.trim() : '')
  if (text) return { why: firstSentence(text), whySource: 'captured' }
  if (fallback.trim()) return { why: firstSentence(fallback), whySource: 'spawn' }
  return { why: '', whySource: 'none' }
}
