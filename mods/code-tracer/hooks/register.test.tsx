import { expect, mock, test } from 'claude-code/testing'
import type { EngineInterface as Engine, On } from 'claude-code'

const T0 = 1_800_000_000_000
const SURFACES = ['terminal', 'desktop'] as const
const DIR = '/home/.claude/code-tracer/repo'

const PANE = {
  plugin: 'code-tracer',
  component: 'Pane',
  requestId: 'code-tracer',
  props: { title: 'Code tracer', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const hunk = (newStart: number, lines: string[]) => ({
  oldStart: newStart,
  oldLines: lines.filter(l => !l.startsWith('+')).length,
  newStart,
  newLines: lines.filter(l => !l.startsWith('-')).length,
  lines,
})

type Msg = { role: 'user' | 'assistant'; text: string; toolUses: { tool_use_id: string; tool: string; input: Record<string, unknown> }[] }

// git, the store, the transcript and the engine's tool results, answered beneath the mod.
const world = (on: On) => {
  mock.store(on)
  mock.env(on, { HOME: '/home' })
  const clock = mock.clock(on, { now: T0 })
  const state = { written: {} as Record<string, string>, opened: [] as string[], messages: {} as Record<string, Msg[]>, importers: 3 }
  on('session.id', async () => ({ value: 'sess-abcdef12' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_, e) => ({ cwd: e.cwd }))
  on('command.register', async (_, e) => ({ value: { command: e.name } }))
  on('process.run', async (_, e) => {
    const a = e.argv.join(' ')
    const stdout = a.startsWith('date')
      ? '+0000'
      : a.includes('rev-parse')
        ? '/repo'
        : a.includes('symbolic-ref')
          ? 'feat/x'
          : a.includes(' grep ')
            ? Array.from({ length: state.importers }, (_, i) => `src/user${i}.ts`).join('\n')
            : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', async (_, e) => {
    const text = state.written[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', async (_, e) => {
    state.written[e.path] = e.text
    return { value: undefined }
  })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.open', async (_, e) => (state.opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('session.messages', async (_, e) => ({ value: state.messages[e.agentId ?? 'main'] ?? [] }))
  on('agent.spawn', async (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.description }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Edit') {
      const path = String(e.file_path)
      return {
        result: { filePath: path, oldString: e.old_string, newString: e.new_string, originalFile: 'x', structuredPatch: [hunk(path.includes('parse') ? 2 : 41, [`-${e.old_string}`, `+${e.new_string}`])], userModified: false, replaceAll: false },
        text: 'edited',
      }
    }
    if (e.tool === 'Write') {
      const path = String(e.file_path)
      const lines = String(e.content).split('\n').map(l => `+${l}`)
      return { result: { type: 'create', filePath: path, content: e.content, structuredPatch: [hunk(1, lines)], originalFile: null }, text: 'written' }
    }
    return { result: 'ok', text: 'ok' }
  })
  return { clock, state }
}

const start = async ($: Engine, clock: { settle: () => Promise<void> }) => {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
}

const spawn = ($: Engine, description: string) =>
  $.agent.spawn({ tool_use_id: `tu-${description}`, prompt: 'do it', description, subagentType: 'test-engineer', provider: { kind: 'engine' }, parentModel: 'claude-opus-5-5', background: false } as never)

const edit = ($: Engine, agentId: string | undefined, tool_use_id: string, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string, tool_use_id, ...(agentId ? { agentId } : {}) } as never)

const said = (text: string, tool_use_id: string): Msg[] => [{ role: 'assistant', text, toolUses: [{ tool_use_id, tool: 'Edit', input: {} }] }]

test('an edit by a subagent shows who, where, the hunk and its captured why', async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  await spawn($, 'fix expiry')
  state.messages['fix expiry'] = said('Expiry check used < so a token valid at :00 was refused.', 'tu1')
  await edit($, 'fix expiry', 'tu1', '/repo/src/auth/token.ts', 'if (exp < now)', 'if (exp <= now)')
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /repo · feat\/x · 1 change · 1 file/ })).toBeDefined()
    expect(await ui.find({ text: /test-engineer/ })).toBeDefined()
    expect(await ui.find({ text: /src\/auth\/token\.ts:41/ })).toBeDefined()
    expect(await ui.find({ text: /Expiry check used </ })).toBeDefined()
    expect(await ui.find({ text: /\+if \(exp <= now\)/ })).toBeDefined()
    expect(await ui.find({ text: /reach 3 files/ })).toBeDefined()
    await ui.unmount()
  }
  // The subagent's edit does not open the pane; only the main loop's does.
  expect(state.opened).toEqual([])
  const stored = state.written[`${DIR}/sess-abcdef12.jsonl`]
  expect(stored).toBeDefined()
  expect(JSON.parse(stored!.split('\n')[0]!).agentId).toBe('fix expiry')
})

test('a new exported function with its test scores high; a cosmetic edit with no why scores low', async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  state.messages.main = said('Add a parser so callers stop hand-rolling it.', 'tu2')
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/parse.ts', content: 'export function parse(s: string) {\n  return s.trim()\n}', tool_use_id: 'tu2' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/parse.test.ts', content: 'parse("x")', tool_use_id: 'tu3' } as never)
  // Re-score happens per change: the parser scored before its test existed, so edit it once more (same agent, same lines: churn, but completeness now counts).
  await edit($, undefined, 'tu4', '/repo/src/parse.ts', 'return s.trim()', 'return s.trim().toLowerCase()')
  state.importers = 0
  state.messages.main = []
  await edit($, undefined, 'tu5', '/repo/src/other.ts', 'foo( a )', 'foo(a)')
  await clock.settle()

  expect(state.opened).toEqual(['code-tracer'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /new capability/ })).toBeDefined()
  expect(await ui.find({ text: /tests or callers touched/ })).toBeDefined()
  expect(await ui.find({ text: /churn ×1/ })).toBeDefined()
  expect(await ui.find({ text: /cosmetic · no why/ })).toBeDefined()
  expect(await ui.find({ text: /4 changes · 3 files · session \d+\/10/ })).toBeDefined()
  await ui.unmount()

  const r = await $.command.run({ command: 'code-tracer', args: 'export', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as never)
  expect(r.text).toContain(`${DIR}/sess-abcdef12.md`)
  const md = state.written[`${DIR}/sess-abcdef12.md`] ?? ''
  expect(md).toContain('## main')
  expect(md).toContain('### src/parse.ts:1-3')
  expect(md).toContain('**Why:** Add a parser so callers stop hand-rolling it.')
})

test('the file view flags a path two agents edited on overlapping lines', async ($, on) => {
  const { clock } = world(on)
  await start($, clock)
  await spawn($, 'a')
  await spawn($, 'b')
  await edit($, 'a', 'tu6', '/repo/src/shared.ts', 'x', 'y')
  await edit($, 'b', 'tu7', '/repo/src/shared.ts', 'y', 'z')
  await $.turn.complete({ agentId: 'a', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /running · claude-haiku-5-5/ })).toBeDefined() // b still runs
    await ui.press({ key: 'mode' })
    expect(await ui.find({ text: /src\/shared\.ts .*⚠ 2 agents · overlapping lines/ })).toBeDefined()
    await ui.press({ key: 'mode' })
    await ui.press({ key: 'filter:a' })
    expect(await ui.find({ text: /\+z/ })).toBeUndefined()
    expect(await ui.find({ text: /\+y/ })).toBeDefined()
    await ui.press({ key: 'filter:a' })
    await ui.unmount()
  }
})
