import type { AgentNode, Node, WorkNode } from '../types'

export type Line = { text: string; tone: 'normal' | 'dim' | 'accent' | 'warn' }

// ISO time → HH:MM at `tz` minutes east of UTC (the module's own clock may not know the zone).
export function hhmm(iso: string, tz: number): string {
  const d = new Date(Date.parse(iso) + tz * 60_000)
  if (Number.isNaN(d.getTime())) return '--:--'
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// Never throws: a bad done/total read back from disk (negative, NaN, total 0) draws an empty or full bar.
export function bar(done: number, total: number, width: number): string {
  const ratio = total > 0 ? done / total : 0
  const filled = Number.isFinite(ratio) ? Math.min(width, Math.max(0, Math.round(ratio * width))) : 0
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// Cut to width with an ellipsis; never leaves half of a surrogate pair (an emoji) at the cut.
export const fit = (text: string, width: number) =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1)).replace(/[\uD800-\uDBFF]$/, '')}…` : text

export const elapsed = (ms?: number) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export const tokens = (n?: number) => (typeof n !== 'number' || !Number.isFinite(n) ? '' : n >= 1000 ? `${Math.round(n / 1000)}k tokens` : `${n} tokens`)

// The lines under a card's title, shared by the terminal and the SVG.
export function cardLines(node: WorkNode | AgentNode): string[] {
  const lines: string[] = []
  if (node.kind === 'agent') {
    lines.push(`${node.type} · ${node.model}${node.isPinned ? ' (pinned)' : ''}`)
    if (!node.isPinned && node.type !== 'fork') lines.push('⚠ no model set: inherited') // a fork always inherits
  }
  const progress = node.total ? `${bar(node.done ?? 0, node.total, 10)} ${node.done ?? 0}/${node.total}` : ''
  const status = node.kind === 'work' ? node.status : [node.state, elapsed(node.elapsedMs)].filter(Boolean).join(' · ')
  lines.push([progress, status].filter(Boolean).join('  '))
  if (node.kind === 'work' && node.how) lines.push(`how: ${node.how}`)
  if (node.kind === 'agent' && node.now && node.state === 'running') lines.push(`now: ${node.now}`)
  if (node.next) lines.push(`next: ${node.next}`)
  if (node.kind === 'agent') {
    lines.push([`${node.tools} tool call${node.tools === 1 ? '' : 's'}`, tokens(node.tokens)].filter(Boolean).join(' · '))
    if (node.result) lines.push(`result: ${node.result}`)
  } else {
    // Newest 5 facts only, so a long commit history can't grow one card without bound.
    if (node.facts.length > 5) lines.push(`↳ +${node.facts.length - 5} earlier`)
    for (const fact of node.facts.slice(-5)) lines.push(`↳ ${fact}`)
  }
  return lines
}

// Nodes → terminal lines. From 70 columns: talk left of the line, work right. Below: one column.
export function renderText(nodes: readonly Node[], columns: number, tz: number): Line[] {
  const lines: Line[] = []
  const isWide = columns >= 70
  const left = Math.floor(columns * 0.38)
  const right = columns - left - 4
  const row = (l: string, mid: string, r: string, tone: Line['tone']) => {
    lines.push({ text: isWide ? `${fit(l, left).padStart(left)}${mid}${fit(r, right)}` : fit(r, columns), tone })
  }

  for (const node of nodes) {
    const time = hhmm(node.at, tz)
    if (node.kind === 'session') {
      const label = ` ${node.title} · ${time} `
      const side = '┄'.repeat(Math.max(2, Math.floor((columns - label.length) / 2)))
      lines.push({ text: fit(`${side}${label}${side}`, columns), tone: 'dim' })
    } else if (node.kind === 'talk') {
      if (isWide) row(node.title, ' ◀─┤', ` ${time}`, 'dim')
      else lines.push({ text: fit(`you: ${node.title}`, columns), tone: 'dim' })
    } else if (node.kind === 'fact') {
      row(time, ' ├· ', isWide ? `↳ ${node.title}` : `${time} ↳ ${node.title}`, 'dim')
    } else if (node.kind === 'work' || node.kind === 'agent') {
      const indent = node.kind === 'agent' ? '  '.repeat(node.depth) : ''
      const glyph = node.kind === 'agent' ? (node.isBackground ? '◇ ' : '◆ ') : `#${node.tag} `
      const tone =
        (node.kind === 'work' && node.status === 'blocked') || (node.kind === 'agent' && node.state === 'failed')
          ? 'warn'
          : node.kind === 'agent' && node.state === 'unknown'
            ? 'dim'
            : 'accent'
      row(time, ' ├─▶', isWide ? ` ${indent}${glyph}${node.title}` : `${time} ${indent}${glyph}${node.title}`, tone)
      for (const text of cardLines(node)) row('', '  │ ', `   ${indent}${text}`, text.startsWith('⚠') ? 'warn' : 'normal')
    }
  }
  return lines
}

// Shapes use mid-tones with 3:1 contrast on light and dark panes; text colors come from CSS classes with a dark-mode
// override, for 4.5:1 on both. Blue/orange, never red against green (color-blind safe).
const BLUE = '#3b6fd8'
const ORANGE = '#d96a10'
const GRAY = '#8b93a1'
const STYLE =
  '.b{fill:#5f6670}.s{fill:#5f6670;font-size:11px}.h{font-weight:600}.t{fill:#2f5bb7}.w{fill:#b4520a}' +
  '@media (prefers-color-scheme:dark){.b,.s{fill:#a3abb8}.t{fill:#7da2f0}.w{fill:#f0954a}}'
const CHAR_PX = 7.3 // Menlo / ui-monospace advance at 12 px
const TIP_CHARS = 600 // hover text per node, before escaping
const SVG_BUDGET = 120_000 // the engine caps an Svg source at 131072 characters; over budget, redraw without hover text

// XML-escape, and drop characters XML forbids (C0 controls except tab/newline/return, lone surrogates).
const esc = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export type SvgOptions = { width?: number; withTips?: boolean; fade?: boolean }

// Nodes → one SVG: center line, talk left, cards right, hover text in <title>. `fade` animates the newest node; pass it
// only when that node is new, because every new source reloads the drawing and would replay the animation.
export function renderSvg(nodes: readonly Node[], tz: number, options: SvgOptions = {}): string {
  const { width = 640, withTips = true, fade = true } = options
  const tipTag = (text: string) => (withTips ? `<title>${esc(fit(text, TIP_CHARS))}</title>` : '')
  const cx = Math.round(width * 0.4)
  const cardX = cx + 24
  const parts: string[] = []
  let y = 24

  nodes.forEach((node, i) => {
    const anim = fade && i === nodes.length - 1 ? '<animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze"/>' : ''
    const time = hhmm(node.at, tz)
    if (node.kind === 'session') {
      parts.push(
        `<g>${anim}<line x1="8" y1="${y}" x2="${width - 8}" y2="${y}" stroke="${GRAY}" stroke-dasharray="4 4"/>` +
          `<text x="${cx}" y="${y - 6}" text-anchor="middle" class="s">${esc(fit(`${node.title} · ${time}`, Math.floor((width - 16) / CHAR_PX)))}</text></g>`,
      )
      y += 30
    } else if (node.kind === 'talk') {
      const label = fit(node.title, Math.floor((cx - 24) / CHAR_PX))
      parts.push(
        `<g>${anim}${tipTag(node.title)}<circle cx="${cx}" cy="${y}" r="4" fill="${GRAY}"/>` +
          `<text x="${cx - 12}" y="${y + 4}" text-anchor="end" class="b">${esc(label)}</text>` +
          `<text x="${cx + 10}" y="${y + 4}" class="s">${time}</text></g>`,
      )
      y += 26
    } else if (node.kind === 'fact') {
      parts.push(
        `<g>${anim}<text x="${cardX}" y="${y + 4}" class="s">${esc(fit(`${time} ↳ ${node.title}`, Math.floor((width - cardX - 8) / CHAR_PX)))}</text></g>`,
      )
      y += 20
    } else if (node.kind === 'work' || node.kind === 'agent') {
      const x = cardX + (node.kind === 'agent' ? 18 * node.depth : 0)
      const w = width - x - 8
      const max = Math.floor((w - 20) / CHAR_PX)
      const lines = cardLines(node)
      const h = 30 + lines.length * 16
      const isBlocked = (node.kind === 'work' && node.status === 'blocked') || (node.kind === 'agent' && node.state === 'failed')
      const isDone = node.kind === 'work' ? node.status === 'done' : node.state === 'done'
      const color = isBlocked ? ORANGE : BLUE
      const glyph = node.kind === 'agent' ? (node.isBackground ? '◇ ' : '◆ ') : `#${node.tag} `
      const tip = [node.title, ...lines, ...(node.kind === 'agent' && node.prompt ? [`prompt: ${node.prompt}`] : [])].join('\n')
      const body = lines
        .map((text, j) => `<text x="${x + 10}" y="${y + 38 + j * 16}" class="${text.startsWith('⚠') ? 'w' : 'b'}">${esc(fit(text, max))}</text>`)
        .join('')
      parts.push(
        `<g>${anim}${tipTag(tip)}` +
          `<circle cx="${cx}" cy="${y + 14}" r="5" fill="${color}"/>` +
          `<line x1="${cx}" y1="${y + 14}" x2="${x}" y2="${y + 14}" stroke="${color}"/>` +
          `<text x="${cx - 10}" y="${y + 18}" text-anchor="end" class="s">${time}</text>` +
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${isDone ? color : 'none'}" fill-opacity="0.1" stroke="${color}"${node.kind === 'agent' ? ' stroke-dasharray="5 3"' : ''}/>` +
          `<text x="${x + 10}" y="${y + 19}" class="h ${isBlocked ? 'w' : 't'}">${esc(fit(`${isDone ? '✓ ' : ''}${glyph}${node.title}`, max))}</text>` +
          `${body}</g>`,
      )
      y += h + 14
    }
  })

  const height = y + 8
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, Menlo, monospace" font-size="12">` +
    `<style>${STYLE}</style>` +
    `<line x1="${cx}" y1="0" x2="${cx}" y2="${height}" stroke="${GRAY}" stroke-width="2"/>` +
    parts.join('') +
    '</svg>'
  return withTips && svg.length > SVG_BUDGET ? renderSvg(nodes, tz, { ...options, withTips: false }) : svg
}
