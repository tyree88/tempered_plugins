export type PlanGroup = { name: string; done: number; total: number }
export type Plan = { title: string; groups: PlanGroup[]; done: number; total: number }

const BOX = /^\s*[-*] \[( |x|X)\]/

// A markdown plan → its title and per-heading checkbox counts; null when it has no boxes.
// Fenced code is skipped, so a `# comment` or a `- [ ]` inside a code block counts for nothing.
export function parsePlan(markdown: string): Plan | null {
  let title = ''
  let fence = '' // the opening marker while inside a fenced block
  const groups: PlanGroup[] = []
  for (const line of markdown.split('\n')) {
    const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (mark) {
      // Only the same character, at least as long and with nothing after it, closes a fence (so ```` can hold ```).
      if (!fence) fence = mark[1]!
      else if (mark[1]![0] === fence[0] && mark[1]!.length >= fence.length && !mark[2]!.trim()) fence = ''
      continue
    }
    if (fence) continue
    const h1 = /^# (.+)/.exec(line)
    if (h1 && !title) {
      title = h1[1]!.trim().replace(/\s+Implementation Plan$/i, '')
      continue
    }
    const h = /^#{2,3} (.+)/.exec(line)
    if (h) {
      groups.push({ name: h[1]!.trim(), done: 0, total: 0 })
      continue
    }
    const box = BOX.exec(line)
    if (!box) continue
    if (!groups.length) groups.push({ name: title || 'Plan', done: 0, total: 0 })
    const group = groups[groups.length - 1]!
    group.total += 1
    if (box[1] !== ' ') group.done += 1
  }
  const counted = groups.filter(g => g.total > 0)
  const total = counted.reduce((n, g) => n + g.total, 0)
  if (!total) return null
  return { title, groups: counted, done: counted.reduce((n, g) => n + g.done, 0), total }
}

// The first group with an unticked box.
export const currentGroup = (plan: Plan) => plan.groups.find(g => g.done < g.total)?.name
