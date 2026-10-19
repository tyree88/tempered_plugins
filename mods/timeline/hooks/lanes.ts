import type { AgentNode, Lane, Node } from '../types'

const LABEL_CELLS = 14
export const LANE_INDENT = LABEL_CELLS + 1 // label + space, in cells; the SVG uses 7 px a cell
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
    lanes.push({ label: a.title, start, end: Math.max(end, start), state: a.state })
  }
  return lanes.slice(-max)
}

const x = (t: number, from: number, to: number, width: number) =>
  Math.round((Math.min(Math.max(t, from), to) - from) / Math.max(1, to - from) * width)

// Terminal lanes: label (LABEL_CELLS cells) + a track of `cells` cells with the run drawn on it.
export function lanesText(lanes: readonly Lane[], from: number, to: number, cells: number): string[] {
  const width = Math.max(10, cells)
  return lanes.map(l => {
    const a = Math.min(width - 1, x(l.start, from, to, width)) // a run that starts now still gets the last cell
    const b = Math.max(a + 1, x(l.end, from, to, width))
    const track = '·'.repeat(a) + GLYPH[l.state].repeat(Math.min(width, b) - a) + '·'.repeat(Math.max(0, width - b))
    return `${l.label.slice(0, LABEL_CELLS).padEnd(LABEL_CELLS)} ${track}`
  })
}

const esc = (s: string) => s.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`)

// Desktop lanes: a small fixed-height SVG; labels on the left, one bar per run.
export function lanesSvg(lanes: readonly Lane[], from: number, to: number, width: number): string {
  if (!lanes.length) return ''
  const label = LANE_INDENT * 7
  const track = Math.max(40, width - label - 8)
  const height = 16 * lanes.length + 8
  const rows = lanes.map((l, i) => {
    const y = 4 + i * 16
    const a = label + x(l.start, from, to, track)
    const w = Math.max(3, label + x(l.end, from, to, track) - a)
    return `<text x="0" y="${y + 10}" fill="#8b93a1">${esc(l.label.slice(0, LABEL_CELLS))}</text><rect x="${a}" y="${y}" width="${w}" height="11" rx="3" fill="${FILL[l.state]}"/>`
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, system-ui" font-size="11">` +
    `<line x1="${label}" y1="${16 * lanes.length + 6}" x2="${label + track}" y2="${16 * lanes.length + 6}" stroke="#8b93a1" stroke-width="1" stroke-opacity="0.6"/>` +
    rows.join('') +
    `</svg>`
  )
}
