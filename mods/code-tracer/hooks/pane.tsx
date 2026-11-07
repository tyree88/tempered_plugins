import type { Elements } from 'claude-code'

import type { Change, View } from '../types'
import { range } from './capture.ts'

type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export const WIDE = 70
export const PREVIEW_LINES = 6

export const hhmm = (ms: number, tzMinutes: number) => {
  const d = new Date(ms + tzMinutes * 60_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export type Handlers = {
  mode: () => void
  filter: (id: string) => () => void
  expand: (id: string) => () => void
  page: (delta: number) => () => void
}

const agentLabel = (c: Change, v: View) => v.agents.find(a => a.id === (c.agentId ?? 'main'))?.label.split(' · ')[0] ?? 'main'

const scoreText = (s: number | null) => (s === null ? '' : `${s}/10`)

// One change: meta line, why, signals, then the hunk (a preview unless expanded). Takes no `$` (the loader rule).
function drawChange(ui: UI, c: Change, v: View, tz: number, isWide: boolean, act: Handlers) {
  const { Box, Text, Button } = ui
  const isOpen = v.expanded.includes(c.id)
  const r = range(c.hunks)
  const where = `${c.path}:${r.from}${r.to > r.from ? `-${r.to}` : ''}`
  const lines = c.hunks.flatMap(k => k.lines)
  const shown = isOpen ? lines : lines.slice(0, PREVIEW_LINES)
  const hidden = lines.length - shown.length
  return (
    <Box key={c.id} flexDirection="column" paddingBottom={1}>
      <Text wrap={isWide ? 'truncate' : 'wrap'}>
        <Text dimColor>{hhmm(c.at, tz)}</Text> <Text color="blue">{agentLabel(c, v)}</Text> {where}{' '}
        <Text color="success">+{c.additions}</Text> <Text color="error">−{c.deletions}</Text>
        {'  '}
        <Text bold>{scoreText(c.score)}</Text>
      </Text>
      <Text wrap="wrap">
        <Text dimColor>why </Text>
        {c.why || <Text dimColor>—</Text>}
      </Text>
      {c.signals.length > 0 && <Text dimColor wrap="truncate">{c.signals.join(' · ')}</Text>}
      {shown.map((l, i) => (
        <Text key={`${c.id}-${i}`} color={l.startsWith('+') ? 'success' : l.startsWith('-') ? 'error' : undefined} dimColor={!l.startsWith('+') && !l.startsWith('-')} wrap="truncate">
          {`  ${l}`}
        </Text>
      ))}
      {(hidden > 0 || isOpen) && lines.length > PREVIEW_LINES && (
        <Box>
          <Button key={`more:${c.id}`} label={isOpen ? 'less' : `more (+${hidden})`} onPress={act.expand(c.id)} />
        </Box>
      )}
    </Box>
  )
}

export function drawPane(ui: UI, v: View, columns: number, tz: number, act: Handlers) {
  const { Box, Text, Button } = ui
  const isWide = columns >= WIDE
  const head = [v.repo, v.branch, `${v.changes} change${v.changes === 1 ? '' : 's'}`, `${v.files} file${v.files === 1 ? '' : 's'}`, v.sessionScore === null ? '' : `session ${v.sessionScore}/10`]
    .filter(Boolean)
    .join(' · ')
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text key="head" bold wrap="truncate">{head}</Text>

      {v.changes === 0 && (
        <Text key="empty" dimColor wrap="wrap">
          No code changes yet. Each Edit, Write or shell write shows here with who made it, why, and a score.
        </Text>
      )}

      {v.agents.length > 0 && (
        <Box key="agents" flexDirection="column">
          <Text bold dimColor>AGENTS</Text>
          {v.agents.map(a => (
            <Box key={`agent:${a.id}`} flexDirection="row" columnGap={1}>
              <Button key={`filter:${a.id}`} label={v.filter === a.id ? `● ${a.label}` : `○ ${a.label}`} onPress={act.filter(a.id)} />
              <Text color={a.isRunning ? 'blue' : undefined} dimColor={!a.isRunning} wrap="truncate">
                {[a.isRunning ? 'running' : '', a.model, `${a.files} file${a.files === 1 ? '' : 's'}`, `+${a.additions} −${a.deletions}`, a.leverage, scoreText(a.score)].filter(Boolean).join(' · ')}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {v.changes > 0 && (
        <Box key="body" flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold dimColor>{v.mode === 'feed' ? 'CHANGES' : 'FILES'}</Text>
            <Box flexDirection="row" columnGap={1}>
              <Button key="mode" label={v.mode === 'feed' ? 'by file' : 'by change'} onPress={act.mode} />
              {v.mode === 'feed' && v.page < v.pages - 1 && <Button key="older" label="◀ older" onPress={act.page(1)} />}
              {v.mode === 'feed' && v.page > 0 && <Button key="newer" label="newer ▶" onPress={act.page(-1)} />}
            </Box>
          </Box>
          {v.mode === 'feed'
            ? v.feed.map(c => drawChange(ui, c, v, tz, isWide, act))
            : v.fileRows.map(f => (
                <Box key={`file:${f.path}`} flexDirection="column">
                  <Text color={f.hasOverlap ? 'warning' : undefined} wrap="truncate">
                    {f.path} <Text dimColor>· {f.agents.join(', ')}</Text>
                    {f.agents.length > 1 ? ` ⚠ ${f.agents.length} agents` : ''}
                    {f.hasOverlap ? ' · overlapping lines' : ''}
                  </Text>
                  {f.ranges.map((r, i) => (
                    <Text key={`${f.path}-${i}`} dimColor wrap="truncate">
                      {`  ${r.agent} ${r.from}${r.to > r.from ? `-${r.to}` : ''}`}
                    </Text>
                  ))}
                </Box>
              ))}
        </Box>
      )}
    </Box>
  )
}
