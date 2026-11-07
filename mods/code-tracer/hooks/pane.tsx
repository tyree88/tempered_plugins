import type { Elements } from 'claude-code'

import type { Change, Legend, View } from '../types'
import { ellipsize } from './ellipsis.ts'

type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export const WIDE = 70 // at or above: code left, explanation right; below: stacked
export const MIN_PATH = 20
export const COLLAPSED_LINES = 8 // hunk lines shown before `more`

export const hhmm = (ms: number, tzMinutes: number) => {
  const d = new Date(ms + tzMinutes * 60_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export type Handlers = {
  filter: (id: string) => () => void
  path: (path: string) => () => void
  expand: (id: string) => () => void
  page: (delta: number) => () => void
  clear: () => void
}

const spanText = (s: { from: number; to: number }) => (s.to > s.from ? `${s.from}-${s.to}` : `${s.from}`)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Token = { text: string; color?: 'success' | 'error' | 'warning'; dim?: boolean }

// Trailing marks of a change: counts, run outcomes, `new` / `deleted` / `diff too large`, `reverted`, `edited by you`.
export const marksOf = (c: Change): Token[] => {
  if (c.isDeleted) return [{ text: 'deleted', color: 'error' }]
  if (c.isTooLarge) return [{ text: 'diff too large', dim: true }]
  const out: Token[] = [{ text: `+${c.additions} −${c.deletions}` }]
  if (c.test) out.push(c.test.ok === null ? { text: `? tested ${c.test.runner}`, dim: true } : { text: `${c.test.ok ? '✓' : '✗'} tested ${c.test.runner}`, color: c.test.ok ? 'success' : 'error' })
  if (c.check) out.push({ text: `${c.check.ok ? '✓' : '✗'} checked ${c.check.runner}`, color: c.check.ok ? 'success' : 'error' })
  if (c.isNew) out.push({ text: 'new', color: 'success' })
  if (c.isReverted) out.push({ text: 'reverted', color: 'error' })
  if (c.userModified) out.push({ text: 'edited by you', color: 'warning' })
  return out
}

const lineColor = (l: string) => (l.startsWith('+') ? 'diffAdded' : l.startsWith('-') ? 'diffRemoved' : undefined)

// The code column: every hunk's lines, wrapped, coloured by sign; collapsed to COLLAPSED_LINES until `more`.
function drawCode(ui: UI, c: Change, isOpen: boolean, act: Handlers) {
  const { Box, Text, Button } = ui
  const lines = c.hunks.flatMap((k, hi) => [{ key: `hh:${c.id}-${hi}`, text: `@@ ${k.oldStart},${k.oldLines} → ${k.newStart},${k.newLines}`, head: true }, ...k.lines.map((l, i) => ({ key: `ln:${c.id}-${hi}-${i}`, text: l, head: false }))])
  const shown = isOpen ? lines : lines.slice(0, COLLAPSED_LINES)
  const hidden = lines.length - shown.length
  return (
    <Box key={`code:${c.id}`} flexDirection="column">
      {shown.map(l => (
        <Text key={l.key} mono wrap="wrap" color={l.head ? undefined : lineColor(l.text)} dimColor={l.head || (!l.text.startsWith('+') && !l.text.startsWith('-'))}>
          {l.text}
        </Text>
      ))}
      {(hidden > 0 || isOpen) && <Button key={`more:${c.id}`} label={isOpen ? 'less' : `more (+${hidden})`} dimColor onPress={act.expand(c.id)} />}
    </Box>
  )
}

function section(ui: UI, key: string, title: string, lines: readonly string[], prefix = '') {
  const { Box, Text } = ui
  return (
    <Box key={key} flexDirection="column">
      <Text bold dimColor>{title}</Text>
      {lines.map((l, i) => (
        <Text key={`${key}-${i}`} wrap="wrap">
          {prefix}
          {l}
        </Text>
      ))}
    </Box>
  )
}

// One card: a frame in the agent's colour; a head line (time, tag, path:lines, marks); then code left and
// why / how it works / what we can do right. Below WIDE columns the two stack.
function drawCard(ui: UI, c: Change, v: View, tz: number, columns: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const agent: Legend | undefined = v.legend.find(a => a.id === (c.agentId ?? 'main'))
  const color = agent?.color ?? 'text'
  const tag = agent?.tag ?? (c.agentId ? c.agentId.slice(0, v.tagWidth) : 'main')
  const inner = columns - 4 // the frame's two cells and one cell of padding each side
  const isWide = inner >= WIDE
  const spans = c.spans.length ? c.spans.map(spanText).join(', ') : ''
  const marks = marksOf(c)
  const prefix = 5 + 1 + 2 + tag.length + 2
  const path = ellipsize(c.path, Math.max(MIN_PATH, inner - prefix - (spans ? spans.length + 1 : 0)))
  const where = `${path}${spans ? `:${spans}` : ''}`
  const { how, next } = v.explained[c.id] ?? { how: [], next: [] }
  const isOpen = v.expanded.includes(c.id)
  const why = c.why || '—'
  const explanation = (
    <Box key={`meta:${c.id}`} flexDirection="column" rowGap={1} flexGrow={1} flexShrink={1}>
      {section(ui, `why:${c.id}`, c.whySource === 'spawn' || c.whySource === 'prompt' ? 'Task' : 'Why', [why])}
      {how.length > 0 && section(ui, `how:${c.id}`, 'How it works', how, '• ')}
      {next.length > 0 && section(ui, `next:${c.id}`, 'Next steps', next, '• ')}
    </Box>
  )
  return (
    <Box key={`card:${c.id}`} flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} marginBottom={1}>
      <Box key={`head:${c.id}`} flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text wrap="truncate">
          <Text dimColor>{`${hhmm(c.at, tz)} `}</Text>
          <Text color={color}>{`■ ${tag}`}</Text>
          {`  ${where}`}
        </Text>
        <Button key={`path:${c.id}`} label={v.pathFilter === c.path ? 'all files' : 'this file'} dimColor onPress={act.path(c.path)} />
      </Box>
      <Box key={`marks:${c.id}`}>
        <Text wrap="truncate">
          {marks.map((t, i) => (
            <Text key={`mk:${c.id}-${i}`} color={t.color} dimColor={t.dim}>
              {i ? ' · ' : ''}
              {t.text}
            </Text>
          ))}
        </Text>
      </Box>
      {c.hunks.length > 0 && (
        <Box key={`body:${c.id}`} flexDirection={isWide ? 'row' : 'column'} columnGap={2} rowGap={1} marginTop={1}>
          {isWide ? (
            <Box key={`left:${c.id}`} width="55%" flexShrink={0}>
              {drawCode(ui, c, isOpen, act)}
            </Box>
          ) : (
            drawCode(ui, c, isOpen, act)
          )}
          {explanation}
        </Box>
      )}
      {c.hunks.length === 0 && <Box marginTop={1}>{explanation}</Box>}
    </Box>
  )
}

export function drawPane(ui: UI, v: View, columns: number, tz: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const running = v.running ? ` (${v.running} running)` : ''
  const head = `${plural(v.changes, 'change')} · ${plural(v.files, 'file')} · ${plural(v.legend.length, 'agent')}${running}`
  const where = `${v.repo}${v.branch ? ` ⎇ ${v.branch}` : ''}`
  const filterTag = v.filter ? v.legend.find(a => a.id === v.filter)?.tag ?? v.filter : undefined
  const showing = [v.pathFilter ? ellipsize(v.pathFilter, Math.max(MIN_PATH, columns - 20)) : '', filterTag ?? ''].filter(Boolean).join(' · ')
  return (
    <Box flexDirection="column" rowGap={1}>
      <Box key="head" flexDirection="column">
        <Text bold wrap="truncate">{head}</Text>
        <Text dimColor wrap="truncate">{where}</Text>
      </Box>

      {v.conflicts.files > 0 && (
        <Box key="conflict">
          <Text wrap="truncate">
            <Text color="warning">⚠</Text>
            {` ${plural(v.conflicts.files, 'shared file')} · ${plural(v.conflicts.overlapping, 'overlap')}`}
          </Text>
        </Box>
      )}

      {v.legend.length > 0 && (
        <Box key="legend" flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={0}>
          {v.legend.map(a => (
            <Button key={`filter:${a.id}`} onPress={act.filter(a.id)}>
              <Text color={a.color}>{`${v.filter === a.id ? '●' : '■'} ${a.tag}`}</Text>
              <Text dimColor>{` ${a.state === 'running' ? '▶' : a.changes}`}</Text>
            </Button>
          ))}
        </Box>
      )}

      {v.changes === 0 && (
        <Text key="empty" dimColor wrap="wrap">
          No code changes yet. Each Edit, Write or shell write shows here as a card: the code on the left; why, how it works and next steps on the right.
        </Text>
      )}

      {v.changes > 0 && (
        <Box key="cards" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} paddingTop={1}>
          <Box key="nav" flexDirection="row" columnGap={3} marginBottom={1}>
            <Text dimColor wrap="truncate">{`${v.feed.length} shown${showing ? ` · ${showing}` : ''}`}</Text>
            {(v.filter || v.pathFilter) && <Button key="clear" label="clear" dimColor onPress={act.clear} />}
            {v.pages > 1 && v.page < v.pages - 1 && <Button key="older" label="◀ older" dimColor onPress={act.page(1)} />}
            {v.pages > 1 && <Text dimColor>{`${v.page + 1} of ${v.pages}`}</Text>}
            {v.pages > 1 && v.page > 0 && <Button key="newer" label="newer ▶" dimColor onPress={act.page(-1)} />}
          </Box>
          {v.feed.map(c => drawCard(ui, c, v, tz, columns - 4, act))}
        </Box>
      )}
    </Box>
  )
}
