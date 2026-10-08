import type { AgentNode, Lane, Node } from '../types'

const LABEL_CELLS = 9
const GLYPH = { running: '▓', done: '█', failed: '▒', unknown: '░' } as const
const FILL = { running: '#3b6fd8', done: '#2f9e44', failed: '#e03131', unknown: '#8b93a1' } as const

// Agent runs that overlap [now - windowMs, now], newest `max`, oldest first.
export function buildLanes(nodes: readonly Node[], now: number, windowMs: number, max: number): Lane[] {
  const from = now - windowMs
  const lanes: Lane[] = []
  for (const n of nodes) {
    if (n.kind !== 'agent') continue
    const a = n as AgentNode
    const start = Date.parse(a.at)
    if (!Number.isFinite(start)) continue
    const end = a.state === 'running' ? now : start + (a.elapsedMs ?? 0)
    if (end < from || start > now) continue
    lanes.push({ label: a.type, start, end: Math.max(end, start), state: a.state })
  }
  return lanes.slice(-max)
}

const x = (t: number, from: number, to: number, width: number) =>
  Math.round((Math.min(Math.max(t, from), to) - from) / Math.max(1, to - from) * width)

// Terminal lanes: label (9 cells) + a track of `cells` cells with the run drawn on it.
export function lanesText(lanes: readonly Lane[], from: number, to: number, cells: number): string[] {
  const width = Math.max(10, cells)
  return lanes.map(l => {
    const a = x(l.start, from, to, width)
    const b = Math.max(a + 1, x(l.end, from, to, width))
    const track = '·'.repeat(a) + GLYPH[l.state].repeat(Math.min(width, b) - a) + '·'.repeat(Math.max(0, width - b))
    return `${l.label.slice(0, LABEL_CELLS).padEnd(LABEL_CELLS)} ${track}`
  })
}

const esc = (s: string) => s.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`)

// Desktop lanes: a small fixed-height SVG; labels on the left, one bar per run.
export function lanesSvg(lanes: readonly Lane[], from: number, to: number, width: number): string {
  if (!lanes.length) return ''
  const label = 70
  const track = Math.max(40, width - label - 8)
  const height = 16 * lanes.length + 20
  const rows = lanes.map((l, i) => {
    const y = 4 + i * 16
    const a = label + x(l.start, from, to, track)
    const w = Math.max(3, label + x(l.end, from, to, track) - a)
    return `<text x="0" y="${y + 10}" class="l">${esc(l.label.slice(0, 10))}</text><rect x="${a}" y="${y}" width="${w}" height="11" rx="3" fill="${FILL[l.state]}"/>`
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, system-ui" font-size="11">` +
    `<style>.l{fill:#5f6670}@media (prefers-color-scheme: dark){.l{fill:#a3a9b3}}</style>` +
    `<line x1="${label}" y1="${height - 14}" x2="${label + track}" y2="${height - 14}" stroke="#8b93a1" stroke-width="0.5"/>` +
    rows.join('') +
    `</svg>`
  )
}
