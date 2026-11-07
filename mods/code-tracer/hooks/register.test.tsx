import { expect, mock, test } from 'claude-code/testing'
import type { EngineInterface as Engine, On } from 'claude-code'

const T0 = 1_800_000_000_000
const DIR = '/home/.claude/code-tracer/repo'

const pane = (bodyColumns: number) =>
  ({
    plugin: 'code-tracer',
    component: 'Pane',
    requestId: 'code-tracer',
    surface: 'terminal',
    props: { title: 'Code tracer', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
  }) as const

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
  const state = { written: {} as Record<string, string>, opened: [] as string[], messages: {} as Record<string, Msg[]>, importers: 3, failBash: false, stdout: '' }
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
    return { value: { exitCode: 0, stdout, stderr: '', signal: null } }
  })
  on('fs.write', async (_, e) => ((state.written[e.path] = String((e as { text?: unknown; data?: unknown }).text ?? (e as { data?: unknown }).data)), { value: undefined }))
  on('fs.read', async (_, e) => ({ value: state.written[e.path] ?? '' }))
  on('fs.list', async (_, e) => ({
    value: Object.keys(state.written)
      .filter(p => p.startsWith(`${e.path}/`))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: state.written[p]!.length, mtimeMs: T0, isLink: false })),
  }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.open', async (_, e) => (state.opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('session.messages', async (_, e) => ({ value: state.messages[e.agentId ?? 'main'] ?? [] }))
  on('agent.spawn', async (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.description }))
  on('turn.start', async (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.check', async () => ({ decision: 'allow' as const, reason: 'test' }))
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
    if (e.tool === 'Bash') {
      const isError = state.failBash
      state.failBash = false
      return { result: { stdout: state.stdout, stderr: '', interrupted: false }, text: state.stdout, ...(isError ? { isError: true } : {}) }
    }
    return { result: 'ok', text: 'ok' }
  })
  return { clock, state }
}

const start = async ($: Engine, clock: { settle: () => Promise<void> }) => {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
}

const spawn = ($: Engine, description: string, subagentType = 'test-engineer') =>
  $.agent.spawn({ tool_use_id: `tu-${description}`, prompt: 'do it', description, subagentType, provider: { kind: 'engine' }, parentModel: 'claude-opus-5-5', background: false } as never)

const edit = ($: Engine, agentId: string | undefined, tool_use_id: string, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string, tool_use_id, ...(agentId ? { agentId } : {}) } as never)

const bash = ($: Engine, agentId: string | undefined, tool_use_id: string, command: string) =>
  $.tool.call({ tool: 'Bash', command, tool_use_id, ...(agentId ? { agentId } : {}) } as never)

const complete = ($: Engine, agentId: string | undefined) =>
  $.turn.complete({ ...(agentId ? { agentId } : {}), answer: 'done', durationMs: 1, isAborted: false, turnId: `t-${agentId ?? 'main'}`, reason: 'answer' })

const said = (text: string, tool_use_id: string): Msg[] => [{ role: 'assistant', text, toolUses: [{ tool_use_id, tool: 'Edit', input: {} }] }]

test('cards at 60 and 90 columns: head, marks, code, why / how / next steps; legend filters; two agents on one file are named', async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  await spawn($, 'a')
  await spawn($, 'b')
  state.messages.a = said('Expiry check used < so a token valid at :00 was refused.', 'tu1')
  state.messages.main = [{ role: 'user', text: 'Rename foo to bar everywhere.', toolUses: [] }, ...said('', 'tu3')]
  await edit($, 'a', 'tu1', '/repo/src/auth/token.ts', 'if (exp < now)', 'if (exp <= now)')
  await edit($, 'b', 'tu2', '/repo/src/auth/token.ts', 'if (exp <= now)', 'if (exp <= now + 1)')
  await edit($, undefined, 'tu3', '/repo/src/other.ts', 'foo(a)', 'bar(a)')
  state.stdout = 'Tests  3 passed (3)'
  await bash($, undefined, 'tu4', 'pnpm test')
  await complete($, 'a')
  await clock.settle()

  for (const columns of [60, 90] as const) {
    const ui = await $.ui.mount(pane(columns))
    const head = await ui.find({ key: 'head' })
    expect(head!.text).toMatch(/3 changes · 2 files · 3 agents/)
    expect(head!.text).toMatch(/repo ⎇ feat\/x/)
    expect((await ui.find({ key: 'conflict' }))!.text).toMatch(/^⚠ 1 shared file · 1 overlap/)
    // legend: main first, then the two same-type agents with distinct tags
    expect((await ui.find({ key: 'filter:main' }))!.text).toMatch(/main/)
    expect((await ui.find({ key: 'filter:a' }))!.text).toMatch(/test-enginee\b/)
    expect((await ui.find({ key: 'filter:b' }))!.text).toMatch(/test-engin#2/)
    // newest first: main's card, then b, then a
    expect(await ui.find({ key: 'card:sess-abc-3' })).toBeDefined()
    const headA = await ui.find({ key: 'head:sess-abc-1' })
    expect(headA!.text).toMatch(/^\d\d:\d\d ■ test-enginee\s+src\/auth\/token\.ts:41/)
    expect((await ui.find({ key: 'marks:sess-abc-1' }))!.text).toBe('+1 −1')
    expect((await ui.find({ key: 'marks:sess-abc-3' }))!.text).toMatch(/^\+1 −1 · ✓ tested pnpm test$/)
    expect((await ui.find({ key: 'why:sess-abc-1' }))!.text).toMatch(/^Why\s*Expiry check used </)
    expect((await ui.find({ key: 'how:sess-abc-1' }))!.text).toMatch(/How it works\s*• Edits lines 41 \(\+1 −1\)\.\s*• 3 files import it: user0\.ts, user1\.ts, user2\.ts\./)
    expect((await ui.find({ key: 'next:sess-abc-1' }))!.text).toMatch(/Next steps\s*• Check the changes of test-engin#2 in this file\. Lines 41 overlap\.\s*• Run the tests that cover token\.ts\./)
    expect((await ui.find({ key: 'why:sess-abc-3' }))!.text).toMatch(/^Task\s*Rename foo to bar everywhere\.$/)
    expect((await ui.find({ key: 'next:sess-abc-3' }))!.text).not.toMatch(/No reason is recorded/)
    // the code column holds the hunk header and both lines, wrapped, with no `more` for a short hunk
    expect(await ui.find({ type: 'Text', text: /^@@ 41,1 → 41,1$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\+if \(exp <= now\)$/ })).toBeDefined()
    expect(await ui.find({ key: 'more:sess-abc-1' })).toBeUndefined()
    // two columns at 90, stacked at 60
    if (columns >= 90) expect(await ui.find({ key: 'left:sess-abc-1' })).toBeDefined()
    else expect(await ui.find({ key: 'left:sess-abc-1' })).toBeUndefined()
    expect(await ui.find({ key: 'code:sess-abc-1' })).toBeDefined()
    // legend press filters to one agent; clear restores
    await ui.press({ key: 'filter:a' })
    expect(await ui.find({ key: 'card:sess-abc-1' })).toBeDefined()
    expect(await ui.find({ key: 'card:sess-abc-2' })).toBeUndefined()
    expect((await ui.find({ key: 'nav' }))!.text).toMatch(/1 shown · test-enginee/)
    await ui.press({ key: 'clear' })
    expect(await ui.find({ key: 'card:sess-abc-2' })).toBeDefined()
    await ui.unmount()
  }
  // Subagent edits do not open the pane; main's does. Agents persist with their tags.
  expect(state.opened).toEqual(['code-tracer'])
  const stored = state.written[`${DIR}/sess-abcdef12.jsonl`]!
  const rows = stored.split('\n').map(l => JSON.parse(l) as { kind: string; tag?: string })
  expect(rows.filter(r => r.kind === 'agent').map(r => r.tag)).toEqual(['main', 'test-enginee', 'test-engin#2'])
})

test('main shows ▶ while running and its count after; the path button narrows to one file; a long hunk folds behind more', async ($, on) => {
  const { clock } = world(on)
  await start($, clock)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await edit($, undefined, 'tu1', '/repo/src/a.ts', 'x', 'y')
  await clock.settle()
  let ui = await $.ui.mount(pane(70))
  expect((await ui.find({ key: 'filter:main' }))!.text).toMatch(/■ main ▶$/)
  await ui.unmount()
  await complete($, undefined)
  await clock.settle()
  ui = await $.ui.mount(pane(70))
  expect((await ui.find({ key: 'filter:main' }))!.text).toMatch(/■ main 1$/)
  await ui.unmount()

  await spawn($, 'r', 'agent-protocols:code-reviewer')
  await bash($, 'r', 'tu2', 'cd /repo && rg tokenExpiry src')
  await edit($, undefined, 'tu3', '/repo/src/b.ts', 'p', 'q')
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/long.ts', content: Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'), tool_use_id: 'tu4' } as never)
  await clock.settle()
  ui = await $.ui.mount(pane(90))
  // a running agent with no change is in the legend; its tag drops the plugin prefix
  expect((await ui.find({ key: 'filter:r' }))!.text).toMatch(/code-reviewe ▶$/)
  // 1 header + 12 lines: 8 shown, 5 behind `more`
  const more = await ui.find({ key: 'more:sess-abc-3' })
  expect(more).toBeDefined()
  expect(more!.text).toMatch(/more \(\+5\)/)
  expect(await ui.find({ type: 'Text', text: /^\+line 11$/ })).toBeUndefined()
  await ui.press({ key: 'more:sess-abc-3' })
  expect(await ui.find({ type: 'Text', text: /^\+line 11$/ })).toBeDefined()
  expect((await ui.find({ key: 'more:sess-abc-3' }))!.text).toMatch(/less/)
  // the path button keeps only that file's cards
  await ui.press({ key: 'path:sess-abc-2' })
  expect(await ui.find({ key: 'card:sess-abc-2' })).toBeDefined()
  expect(await ui.find({ key: 'card:sess-abc-1' })).toBeUndefined()
  expect(await ui.find({ key: 'card:sess-abc-3' })).toBeUndefined()
  expect((await ui.find({ key: 'nav' }))!.text).toMatch(/1 shown · src\/b\.ts/)
  expect((await ui.find({ key: 'path:sess-abc-2' }))!.text).toMatch(/all files/)
  await ui.press({ key: 'path:sess-abc-2' })
  expect(await ui.find({ key: 'card:sess-abc-1' })).toBeDefined()
  await ui.unmount()

  // a reload runs session.start again with the state kept and the module's counters reset: ids continue
  await start($, clock)
  await edit($, undefined, 'tu5', '/repo/src/c.ts', 'm', 'n')
  await clock.settle()
  ui = await $.ui.mount(pane(90))
  expect(await ui.find({ key: 'card:sess-abc-4' })).toBeDefined()
  expect((await ui.find({ key: 'head' }))!.text).toMatch(/4 changes/)
  await ui.unmount()
})

test('a failed then passing run shows ✓ once and changes the next step; README gets no test token; export carries the signed sum', async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  state.messages.main = said('Add a parser so callers stop hand-rolling it.', 'tu1')
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/parse.ts', content: 'export function parse(s: string) {\n  return s.trim()\n}', tool_use_id: 'tu1' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/parse.test.ts', content: "import { parse } from './parse'\nparse('x')", tool_use_id: 'tu2' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: '# parse', tool_use_id: 'tu3' } as never)
  state.failBash = true
  await bash($, undefined, 'tu4', 'npx vitest run')
  await clock.settle()
  let ui = await $.ui.mount(pane(90))
  expect((await ui.find({ key: 'marks:sess-abc-1' }))!.text).toMatch(/✗ tested vitest/)
  expect((await ui.find({ key: 'next:sess-abc-1' }))!.text).toMatch(/• Fix the failing vitest run\./)
  await ui.unmount()
  await bash($, undefined, 'tu5', 'npx vitest run')
  await clock.settle()
  ui = await $.ui.mount(pane(90))
  const marks = await ui.find({ key: 'marks:sess-abc-1' })
  expect(marks!.text).toBe('+3 −0 · ✓ tested vitest · new')
  expect((await ui.find({ key: 'head:sess-abc-1' }))!.text).toMatch(/■ main\s+src\/parse\.ts:1-3/)
  expect((await ui.find({ key: 'how:sess-abc-1' }))!.text).toMatch(/• New file with 3 lines\.\s*• Adds parse\.\s*• 3 files import it: user0\.ts, user1\.ts, user2\.ts\./)
  expect((await ui.find({ key: 'next:sess-abc-1' }))!.text).toMatch(/• The tests pass\. No step is necessary\./)
  expect((await ui.find({ key: 'marks:sess-abc-3' }))!.text).not.toMatch(/tested/)
  expect((await ui.find({ key: 'why:sess-abc-3' }))!.text).toMatch(/^Why\s*—$/)
  expect((await ui.find({ key: 'next:sess-abc-3' }))!.text).toMatch(/• No reason is recorded\. Ask main\./)
  await ui.unmount()

  const r = await $.command.run({ command: 'code-tracer', args: 'export', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as never)
  expect(r.text).toContain(`${DIR}/sess-abcdef12.md`)
  const md = state.written[`${DIR}/sess-abcdef12.md`] ?? ''
  expect(md).toContain('## main')
  expect(md).toContain('### src/parse.ts:1-3')
  expect(md).toContain('**Why:** Add a parser so callers stop hand-rolling it.')
  expect(md).toMatch(/\*\*Ambition \+\d+:\*\* \+2 adds export parse/)
  expect(md).not.toMatch(/\d+\/10\b/)
})
