import type { Elements } from 'claude-code'

import type { AgentRow, AgentState, Change, FileRow, Signal, View } from '../types'
import { ellipsize, ellipsizeAll } from './ellipsis.ts'

type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export const WIDE = 90 // at or above: one-line header, joined agent lines, trailing tokens on the meta line
export const MIN_PATH = 20
export const FEED_INDENT = 6

export const hhmm = (ms: number, tzMinutes: number) => {
  const d = new Date(ms + tzMinutes * 60_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export const elapsed = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

export type Handlers = {
  mode: () => void
  filter: (id: string) => () => void
  expand: (id: string) => () => void
  page: (delta: number) => () => void
  filePage: (delta: number) => () => void
  showConflicts: () => void
  clear: () => void
  file: (path: string) => () => void
  showAll: () => void
}

const glyphOf = (state: AgentState) => (state === 'running' ? '▶' : state === 'done' ? '✓' : '·')
const spanText = (s: { from: number; to: number }) => (s.to > s.from ? `${s.from}-${s.to}` : `${s.from}`)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Token = { text: string; color?: 'success' | 'error' | 'warning' | 'blue'; dim?: boolean }

const signalToken = (s: Signal): Token => {
  const text = s.pts ? `${sign(s.pts)} ${s.label}` : s.label
  if (s.label === 'edited by you' || s.label.startsWith('⚠')) return { text, color: 'warning' }
  if (s.label.startsWith('✗')) return { text, color: 'error' }
  if (s.label.startsWith('✓')) return { text, color: 'success' }
  if (!s.pts) return { text, dim: true }
  return { text }
}

// Trailing tokens of a change: counts, run outcome, `new` / `deleted` / `diff too large`.
const trailingOf = (c: Change): Token[] => {
  if (c.isDeleted) return [{ text: 'deleted', color: 'error' }]
  if (c.isTooLarge) return [{ text: 'diff too large', dim: true }]
  const out: Token[] = [{ text: `+${c.additions} −${c.deletions}` }]
  if (c.test) out.push(c.test.ok === null ? { text: `? tested ${c.test.runner}`, dim: true } : { text: `${c.test.ok ? '✓' : '✗'} tested ${c.test.runner}`, color: c.test.ok ? 'success' : 'error' })
  if (c.check) out.push({ text: `${c.check.ok ? '✓' : '✗'} checked ${c.check.runner}`, color: c.check.ok ? 'success' : 'error' })
  if (c.isNew) out.push({ text: 'new', color: 'success' })
  return out
}

const tokensText = (ts: readonly Token[]) => ts.map(t => t.text).join(' · ')

function Tokens(ui: UI, ts: readonly Token[], key: string, extra?: { wrap?: 'wrap' | 'truncate'; indent?: number }) {
  const { Box, Text } = ui
  return (
    <Box key={key}>
      <Text wrap={extra?.wrap ?? 'truncate'}>
        {extra?.indent ? ' '.repeat(extra.indent) : ''}
        {ts.map((t, i) => (
          <Text key={`${key}-${i}`} color={t.color} dimColor={t.dim}>
            {i ? ' · ' : ''}
            {t.text}
          </Text>
        ))}
      </Text>
    </Box>
  )
}

// One change. Fixed prefix: time 5, space, glyph, space, tag T, two spaces. The path gets the rest, never under 20
// cells; when the line cannot hold prefix + 20 + the trailing tokens, the tokens move to a sub-line indented 6.
function drawChange(ui: UI, c: Change, v: View, tz: number, columns: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const T = v.tagWidth
  const agent = v.agents.find(a => a.id === (c.agentId ?? 'main'))
  const state: AgentState = agent?.state ?? 'done'
  const tag = (agent?.tag ?? (c.agentId ? c.agentId.slice(0, T) : 'main')).padEnd(T)
  const glyph = `${glyphOf(state)}${c.userModified ? '✎' : ''}`
  const isWide = columns >= WIDE
  const prefix = 5 + 1 + glyph.length + 1 + T + 2
  const spans = c.spans.length ? (isWide ? c.spans.map(spanText).join(', ') : `${spanText(c.spans[0]!)}${c.spans.length > 1 ? ` +${c.spans.length - 1} hunk${c.spans.length > 2 ? 's' : ''}` : ''}`) : ''
  const trailing = trailingOf(c)
  const trailingText = tokensText(trailing)
  const roomForPath = columns - prefix - (spans ? spans.length + 1 : 0)
  const onLine = isWide && roomForPath - (trailingText.length + 2) >= MIN_PATH
  const path = ellipsize(c.path, Math.max(MIN_PATH, roomForPath - (onLine ? trailingText.length + 2 : 0)))
  const where = `${path}${spans ? `:${spans}` : ''}`
  const isOpen = v.expanded.includes(c.id)
  const lines = c.hunks.flatMap(k => k.lines)
  const firstMinus = lines.find(l => l.startsWith('-'))
  const firstPlus = lines.find(l => l.startsWith('+'))
  const collapsed = [firstMinus, firstPlus].filter((l): l is string => l !== undefined)
  const hidden = lines.length - collapsed.length
  const pad = ' '.repeat(FEED_INDENT)
  const unscored = c.isDeleted || c.isTooLarge
  return (
    <Box key={c.id} flexDirection="column" paddingBottom={1}>
      <Box key={`meta:${c.id}`}>
      <Text wrap="truncate">
        {`${hhmm(c.at, tz)} `}
        <Text color={state === 'running' ? 'blue' : undefined}>{glyph}</Text>
        {` ${tag}  ${where}`}
        {onLine ? '  ' : ''}
        {onLine &&
          trailing.map((t, i) => (
            <Text key={`tt:${c.id}-${i}`} color={t.color} dimColor={t.dim}>
              {i ? ' · ' : ''}
              {t.text}
            </Text>
          ))}
      </Text>
      </Box>
      {!onLine && Tokens(ui, trailing, `sub:${c.id}`, { indent: FEED_INDENT })}
      {!unscored && (
        <Box key={`amb:${c.id}`}>
        <Text wrap="wrap">
          {`${pad}ambition ${sign(c.points ?? 0)}   `}
          {c.signals.map((s, i) => {
            const t = signalToken(s)
            return (
              <Text key={`sig:${c.id}-${i}`} color={t.color} dimColor={t.dim}>
                {i ? ' · ' : ''}
                {t.text}
              </Text>
            )
          })}
        </Text>
        </Box>
      )}
      {!unscored && (
        <Box key={`why:${c.id}`}>
        <Text wrap="wrap">
          {pad}
          <Text dimColor>{c.whySource === 'spawn' ? 'task  ' : c.why ? 'why   ' : 'why —'}</Text>
          {c.why}
        </Text>
        </Box>
      )}
      {!unscored &&
        (isOpen
          ? c.hunks.flatMap((k, hi) => [
              <Text key={`hh:${c.id}-${hi}`} dimColor wrap="truncate">{`${pad}@@ ${k.oldStart},${k.oldLines} → ${k.newStart},${k.newLines}`}</Text>,
              ...k.lines.map((l, i) => (
                <Text key={`ln:${c.id}-${hi}-${i}`} color={l.startsWith('+') ? 'success' : l.startsWith('-') ? 'error' : undefined} dimColor={!l.startsWith('+') && !l.startsWith('-')} wrap="truncate">
                  {`${pad}${l}`}
                </Text>
              )),
            ])
          : collapsed.map((l, i) => (
              <Text key={`ln:${c.id}-${i}`} color={l.startsWith('+') ? 'success' : 'error'} wrap="truncate">
                {`${pad}${l}`}
              </Text>
            )))}
      {!unscored && (
        <Box flexDirection="row" columnGap={1}>
          <Text>{pad.slice(1)}</Text>
          {(hidden > 0 || isOpen) && <Button key={`more:${c.id}`} label={isOpen ? 'less' : `more (+${hidden})`} onPress={act.expand(c.id)} />}
          <Button key={`file:${c.id}`} label="file" onPress={act.file(c.path)} />
        </Box>
      )}
    </Box>
  )
}

function drawAgent(ui: UI, a: AgentRow, v: View, tz: number, columns: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const T = v.tagWidth
  const isWide = columns >= WIDE
  const word = a.state === 'running' ? `running${a.elapsedMs !== undefined ? ` ${elapsed(a.elapsedMs)}` : ''}` : a.state
  const line1 = ` · ${plural(a.evidence.changes, 'change')}`
  const last = a.last ? `last ${hhmm(a.last.at, tz)} ${a.last.tool} ${a.last.target}`.trim() : ''
  const ev = a.evidence
  const line3 = [
    ev.sharedFiles ? `${ev.sharedFiles} shared` : '',
    ev.reverted ? `${ev.reverted} reverted` : '',
    `tests ran after ${ev.testsAfter} of ${ev.changes}`,
    `${ev.noWhy} no why`,
    a.activity,
    a.model,
    a.description,
  ]
    .filter(Boolean)
    .join(' · ')
  const indent = ' '.repeat(T + 6)
  return (
    <Box key={`agent:${a.id}`} flexDirection="column">
      <Box flexDirection="row" columnGap={2}>
        <Button key={`filter:${a.id}`} label={`${v.filter === a.id ? '●' : '○'} ${a.tag.padEnd(T)}`} onPress={act.filter(a.id)} />
        <Box key={`state:${a.id}`}>
          <Text wrap="truncate">
            <Text color={a.state === 'running' ? 'blue' : undefined}>{`${glyphOf(a.state)} ${word}`}</Text>
            {line1}
            {isWide && last ? ` · ${last}` : ''}
          </Text>
        </Box>
      </Box>
      {!isWide && last && (
        <Box key={`last:${a.id}`}>
          <Text wrap="truncate">{`${indent}${last}`}</Text>
        </Box>
      )}
      <Box key={`ev:${a.id}`}>
        <Text dimColor wrap="truncate">{`${indent}${line3}`}</Text>
      </Box>
    </Box>
  )
}

function drawFile(ui: UI, f: FileRow, label: string, v: View, tz: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const T = v.tagWidth
  const n = f.agents.length
  const pad = ' '.repeat(FEED_INDENT)
  return (
    <Box key={`file:${f.path}`} flexDirection="column">
      <Box flexDirection="row" columnGap={2}>
        <Box key={`frow:${f.path}`}>
          {n > 1 ? (
            <Text>
              <Text color={f.overlap ? 'warning' : undefined}>⚠</Text>
              {` ${n} agents${f.overlap ? ` · overlap ${spanText(f.overlap)}` : ''}`}
            </Text>
          ) : (
            <Text dimColor>{`  1 agent`}</Text>
          )}
        </Box>
        <Button key={`path:${f.path}`} label={label} onPress={act.file(f.path)} />
      </Box>
      {f.agents.map(a => (
        <Box key={`fa:${f.path}:${a.id}`}>
        <Text wrap="truncate">
          {`${pad}`}
          <Text color={a.state === 'running' ? 'blue' : undefined}>{glyphOf(a.state)}</Text>
          {` ${a.tag.padEnd(T)}  `}
          {a.spans.map((s, i) => (
            <Text key={`fs:${f.path}:${a.id}-${i}`}>
              {i ? ', ' : ''}
              {spanText(s)}
              {s.overlap && <Text color="warning">⚠</Text>}
            </Text>
          ))}
          <Text dimColor>{`   last ${hhmm(a.lastAt, tz)}`}</Text>
        </Text>
        </Box>
      ))}
    </Box>
  )
}

export function drawPane(ui: UI, v: View, columns: number, tz: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const isWide = columns >= WIDE
  const ev = v.evidence
  const h1 = `${plural(v.changes, 'change')} · ${plural(v.files, 'file')} · ${plural(v.agents.length + v.hiddenDone, 'agent')} (${v.running} running)`
  const h2 = [`tests ran after ${ev.testsAfter} of ${ev.changes}`, `${ev.noWhy} no why`, ev.reverted ? `${ev.reverted} reverted` : '', ev.sharedFiles ? `${plural(ev.sharedFiles, 'shared file')}` : ''].filter(Boolean).join(' · ')
  const h3 = `${v.repo}${v.branch ? ` ⎇ ${v.branch}` : ''}`
  const oneLine = isWide && `${h1} · ${h2} · ${h3}`.length <= columns
  const paging = (page: number, pages: number, older: string, newer: string, go: (d: number) => () => void) =>
    pages > 1 ? (
      <Box key={`${older}-row`} flexDirection="row" columnGap={3}>
        {page < pages - 1 ? <Button key={older} label="◀ older" onPress={go(1)} /> : <Text dimColor>{'       '}</Text>}
        <Text dimColor>{`${page + 1} of ${pages}`}</Text>
        {page > 0 && <Button key={newer} label="newer ▶" onPress={go(-1)} />}
      </Box>
    ) : null
  const filterTag = v.filter ? v.agents.find(a => a.id === v.filter)?.tag ?? v.filter : undefined
  const headingFilter = v.pathFilter ? ` · ${ellipsize(v.pathFilter, Math.max(MIN_PATH, columns - 20))}` : filterTag ? ` · ${filterTag}` : ''
  const fileLabels = ellipsizeAll(
    v.fileRows.map(f => f.path),
    Math.max(MIN_PATH, columns - 30),
  )
  return (
    <Box flexDirection="column" rowGap={1}>
      {oneLine ? (
        <Box key="head">
          <Text wrap="truncate">
            <Text bold>{h1}</Text>
            <Text dimColor>{` · ${h2} · ${h3}`}</Text>
          </Text>
        </Box>
      ) : (
        <Box key="head" flexDirection="column">
          <Box key="head1">
            <Text bold wrap="truncate">{h1}</Text>
          </Box>
          <Box key="head2">
            <Text dimColor wrap="truncate">{h2}</Text>
          </Box>
          <Box key="head3">
            <Text dimColor wrap="truncate">{h3}</Text>
          </Box>
        </Box>
      )}

      {v.conflicts.files > 0 && (
        <Box key="conflict-row" flexDirection="row" columnGap={3}>
          <Box key="conflict">
            <Text>
              <Text color="warning">⚠</Text>
              {` ${plural(v.conflicts.files, 'shared file')} · ${plural(v.conflicts.overlapping, 'overlap')}`}
            </Text>
          </Box>
          <Button key="show-conflicts" label="show" onPress={act.showConflicts} />
        </Box>
      )}

      {v.changes === 0 && (
        <Text key="empty" dimColor wrap="wrap">
          No code changes yet. Each Edit, Write or shell write shows here with who made it, where, why, and the evidence behind it.
        </Text>
      )}

      {v.agents.length > 0 && (
        <Box key="agents" flexDirection="column">
          <Text bold dimColor>AGENTS</Text>
          {v.agents.map(a => drawAgent(ui, a, v, tz, columns, act))}
          {v.hiddenDone > 0 && (
            <Box flexDirection="row" columnGap={2}>
              <Text dimColor>{`+${v.hiddenDone} done`}</Text>
              <Button key="show-all" label="show all" onPress={act.showAll} />
            </Box>
          )}
        </Box>
      )}

      {v.changes > 0 && (
        <Box key="body" flexDirection="column">
          <Box flexDirection="row" columnGap={2}>
            <Box key="heading">
              <Text bold dimColor wrap="truncate">{`${v.mode === 'feed' ? 'CHANGES' : 'FILES · lines as of now'}${headingFilter}`}</Text>
            </Box>
            {(v.filter || v.pathFilter) && <Button key="clear" label="clear" onPress={act.clear} />}
            <Button key="mode" label={v.mode === 'feed' ? 'by file' : 'by change'} onPress={act.mode} />
            {isWide && (v.mode === 'feed' ? paging(v.page, v.pages, 'older', 'newer', act.page) : paging(v.filePage, v.filePages, 'folder', 'fnewer', act.filePage))}
          </Box>
          {!isWide && (v.mode === 'feed' ? paging(v.page, v.pages, 'older', 'newer', act.page) : paging(v.filePage, v.filePages, 'folder', 'fnewer', act.filePage))}
          {v.mode === 'feed' ? v.feed.map(c => drawChange(ui, c, v, tz, columns, act)) : v.fileRows.map((f, i) => drawFile(ui, f, fileLabels[i] ?? f.path, v, tz, act))}
        </Box>
      )}
    </Box>
  )
}
