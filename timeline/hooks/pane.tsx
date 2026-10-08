import type { Elements } from 'claude-code'

import type { AgentNode, View } from '../types'
import { bar, elapsed, hhmm, tokens } from './draw'
import { lanesSvg, lanesText } from './lanes'

// Svg only where the surface draws it (desktop, mobile, editor); the terminal draws the lanes as text.
type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & { Svg?: Elements['desktop']['Svg'] }

export const WIDE = 70 // body columns at which NEXT and BLOCKED sit side by side
// Theme keys where the app has one, so each theme picks its own legible shade.
const COLOR = { run: 'blue', ok: 'success', warn: 'warning', fail: 'error', normal: undefined, dim: undefined } as const

const iso = (ms: number) => new Date(ms).toISOString()

const stats = (a: AgentNode) =>
  [a.type, a.model, elapsed(a.elapsedMs), a.tools ? `${a.tools} tool${a.tools === 1 ? '' : 's'}` : '', tokens(a.tokens)]
    .filter(Boolean)
    .join(' · ') + (a.isPinned || a.type === 'fork' ? '' : ' · ⚠ inherited model')

// The whole pane from the surface's own elements: the same tree on the terminal and the desktop.
// `page(+1)` shows older history, `page(-1)` newer. Takes no `$` (the loader rule).
export function drawPane(ui: UI, v: View, columns: number, page: (delta: number) => () => void) {
  const { Box, Text, Button, Svg } = ui
  const p = v.panel
  const { lanes, from, to } = p.lanes
  const isWide = columns >= WIDE
  const hasNow = p.nowWork.length > 0 || p.nowAgents.length > 0 || p.nowTasks.length > 0
  const hasSide = p.next.length > 0 || p.blocked.length > 0
  const isEmpty = !hasNow && !hasSide && p.history.length === 0
  const head = [v.repo, v.branch, v.bad ? `${v.bad} unreadable` : ''].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="column" rowGap={1}>
      <Box key="head" flexDirection="column">
        <Text bold wrap="truncate">{head}</Text>
        {/* One Text per line, label inline: a Text beside another in a row gets squeezed on the terminal. */}
        {p.goal && (
          <Box key="goal">
            <Text wrap="wrap">
              <Text dimColor>GOAL</Text> {p.goal}
            </Text>
          </Box>
        )}
        {p.plan && (
          <Box key="plan">
            <Text wrap="truncate">
              <Text dimColor>PLAN</Text> {bar(p.plan.done, p.plan.total, 12)} {p.plan.group ? `${p.plan.group} · ` : ''}
              {p.plan.done}/{p.plan.total} steps
            </Text>
          </Box>
        )}
      </Box>

      {isEmpty && (
        <Text key="empty" dimColor wrap="wrap">
          No activity yet. Claude's task list, subagents and plan steps show here.
        </Text>
      )}

      {(hasNow || hasSide) && (
        <Box key="status" flexDirection="column" rowGap={1} borderStyle="round" borderDimColor paddingX={1}>
          {hasNow && (
            <Box key="now" flexDirection="column">
              <Text bold dimColor>NOW</Text>
              {p.nowWork.map(w => (
                <Box key={`work-${w.task}`} flexDirection="column">
                  <Text color="blue" wrap="wrap">▶ {w.title}</Text>
                  {w.total !== undefined && (
                    <Text dimColor wrap="truncate">
                      {bar(w.done ?? 0, w.total, 10)} {w.done ?? 0}/{w.total}
                    </Text>
                  )}
                </Box>
              ))}
              {p.nowTasks.map(t => (
                <Text key={`task-${t.id}`} color="blue" wrap="wrap">▶ {t.subject}</Text>
              ))}
              {p.nowAgents.map(a => (
                <Box key={`agent-${a.id}`} flexDirection="column">
                  {isWide ? (
                    <Text wrap="wrap">
                      <Text color="blue">▶ {a.title}</Text>
                      {'  '}
                      <Text dimColor>{stats(a)}</Text>
                    </Text>
                  ) : (
                    <Text color="blue" wrap="wrap">▶ {a.title}</Text>
                  )}
                  {!isWide && <Text dimColor wrap="wrap">{stats(a)}</Text>}
                  {(a.now || a.next) && (
                    <Text dimColor wrap="wrap">
                      {[a.now ? `now: ${a.now}` : '', a.next ? `next: ${a.next}` : ''].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {hasSide && (
            <Box key="side" flexDirection={isWide ? 'row' : 'column'} columnGap={2} rowGap={1}>
              {p.next.length > 0 && (
                <Box key="next" flexDirection="column" width={isWide && p.blocked.length ? '50%' : '100%'}>
                  <Text bold dimColor>NEXT</Text>
                  {p.next.map(t => (
                    <Text key={`next-${t.id}`} wrap="wrap">○ {t.subject}</Text>
                  ))}
                  {p.nextMore > 0 && <Text dimColor>+{p.nextMore} more</Text>}
                </Box>
              )}
              {p.blocked.length > 0 && (
                <Box key="blocked" flexDirection="column" width={isWide && p.next.length ? '50%' : '100%'}>
                  <Text bold dimColor>BLOCKED</Text>
                  {p.blocked.map((b, i) => (
                    <Text key={`blocked-${i}`} color={COLOR.warn} wrap="wrap">
                      ⚠ {b.title}{b.waitsOn ? ` — waits on #${b.waitsOn}` : ''}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {lanes.length > 0 && (
        <Box key="lanes" flexDirection="column">
          <Text bold dimColor>AGENTS · last 15 min</Text>
          {Svg ? (
            <Svg
              source={lanesSvg(lanes, from, to, columns * 7)}
              width={columns * 7}
              height={16 * lanes.length + 20}
              alt={`Agent runs in the last 15 minutes: ${lanes.map(l => `${l.label} ${l.state}`).join(', ')}`}
            />
          ) : (
            lanesText(lanes, from, to, columns - 12).map((line, i) => (
              <Text key={`lane-${i}`} dimColor wrap="truncate">{line}</Text>
            ))
          )}
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>{hhmm(iso(from), v.tz)}</Text>
            <Text dimColor>{hhmm(iso((from + to) / 2), v.tz)}</Text>
            <Text dimColor>now</Text>
          </Box>
        </Box>
      )}

      {p.history.length > 0 && (
        <Box key="history" flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold dimColor>HISTORY</Text>
            <Box flexDirection="row" columnGap={1}>
              {p.page < p.pages - 1 && <Button key="older" label="◀ older" onPress={page(1)} />}
              {p.page > 0 && <Button key="newer" label="newer ▶" onPress={page(-1)} />}
            </Box>
          </Box>
          {p.history.map((r, i) =>
            r.depth ? (
              <Text key={`row-${i}`} dimColor wrap="truncate">{`  ${r.isLast ? '└' : '├'} ${r.text}`}</Text>
            ) : (
              <Text key={`row-${i}`} color={COLOR[r.tone]} dimColor={r.tone === 'dim'} wrap="truncate">
                {hhmm(r.at, v.tz)} {r.glyph} {r.text}
              </Text>
            ),
          )}
        </Box>
      )}
    </Box>
  )
}
