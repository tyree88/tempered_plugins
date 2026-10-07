export const PROMPT_CHARS = 1500
export const ANSWER_CHARS = 4000
const OPTION_CHARS = 160

export const SYSTEM = "You suggest the user's next message to a coding agent."

// The one user message for Haiku: the last exchange, then the ask. The prompt keeps its start, the answer its end.
export function buildAsk(prompt: string, answer: string): string {
  return [
    '<user_message>',
    prompt.trim().slice(0, PROMPT_CHARS),
    '</user_message>',
    '<agent_reply>',
    answer.trim().slice(-ANSWER_CHARS),
    '</agent_reply>',
    '',
    'Write the 4 most useful next messages the user could send the agent.',
    "Each one: in the user's voice, an instruction to the agent, at most 100 characters.",
    'Each takes a different direction, in this order:',
    '1. continue the current plan or take the next step',
    '2. verify or test what was just done',
    '3. the alternative path, or answer the open question in the reply',
    '4. wrap up: commit, summarize or close out',
    'Reply with a JSON array of exactly 4 strings and nothing else.',
  ].join('\n')
}

// Haiku's reply → up to 4 clean, distinct options. Anything unparseable → [].
export function parseOptions(text: string): string[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const option = item.replace(/\s+/g, ' ').trim().slice(0, OPTION_CHARS).trimEnd()
    const key = option.toLowerCase()
    if (!option || seen.has(key)) continue
    seen.add(key)
    out.push(option)
    if (out.length === 4) break
  }
  return out
}
