import { expect, mock, test } from 'claude-code/testing'
import type { EngineInterface as Engine, On } from 'claude-code'

const T0 = 1_800_000_000_000
const COLUMNS = [60, 70, 90] as const
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
  const state = { written: {} as Record<string, string>, opened: [] as string[], messages: {} as Record<string, Msg[]>, importers: 3, failBash: false, stdout: '', asked: [] as string[], reply: '[]' }
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
  on('prompt.compose', async () => ({ sections: [{ id: 'base', text: 'base prompt', scope: 'shared' as const }] }))
  on('model.complete', async (_, e) => {
    state.asked.push(e.prompt)
    const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { value: { isAnswered: true, text: state.reply, usage } }
  })
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

const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: ['Edit', 'Bash'], outputStyle: null, traits: [] } as never

const said = (text: string, tool_use_id: string): Msg[] => [{ role: 'assistant', text, toolUses: [{ tool_use_id, tool: 'Edit', input: {} }] }]

const NO_QUOTIENT = /\d+\/10\b/

test('header, conflict strip, tags and meta lines hold at 60, 70 and 90 columns', async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  await spawn($, 'a')
  await spawn($, 'b')
  state.messages.a = said('Expiry check used < so a token valid at :00 was refused.', 'tu1')
  await edit($, 'a', 'tu1', '/repo/src/auth/token.ts', 'if (exp < now)', 'if (exp <= now)')
  await edit($, 'b', 'tu2', '/repo/src/auth/token.ts', 'if (exp <= now)', 'if (exp <= now + 1)')
  await edit($, undefined, 'tu3', '/repo/src/other.ts', 'foo(a)', 'bar(a)')
  state.stdout = 'Tests  3 passed (3)'
  await bash($, undefined, 'tu4', 'pnpm test')
  await complete($, 'a')
  await clock.settle()

  for (const columns of COLUMNS) {
    const ui = await $.ui.mount(pane(columns))
    // one line at or above 90 columns when it fits, else three lines
    const three = [await ui.find({ key: 'head1' }), await ui.find({ key: 'head2' }), await ui.find({ key: 'head3' })]
    const heads = three[0] ? three : [await ui.find({ key: 'head' })]
    for (const line of heads) {
      expect(line).toBeDefined()
      expect(line!.text.length).toBeLessThanOrEqual(columns)
      expect(line!.text).not.toMatch(NO_QUOTIENT)
    }
    expect(await ui.find({ type: 'Text', text: /3 changes · 2 files · 3 agents \(1 running\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /tests ran after 1 of 3 · 2 no why · 1 shared file/ })).toBeDefined()
    const conflict = await ui.find({ key: 'conflict' })
    expect(conflict).toBeDefined()
    expect(conflict!.text.indexOf('⚠')).toBe(0)
    expect(conflict!.text).toMatch(/1 shared file · 1 overlap/)
    // two agents of one type: two tags, identical in AGENTS, the feed and the file view
    expect(await ui.find({ key: 'filter:a' })).toBeDefined()
    expect((await ui.find({ key: 'filter:a' }))!.text).toMatch(/test-enginee\b/)
    expect((await ui.find({ key: 'filter:b' }))!.text).toMatch(/test-engin#2/)
    for (const line of [await ui.find({ key: 'state:a' }), await ui.find({ key: 'state:b' }), await ui.find({ key: 'state:main' })]) {
      expect(line).toBeDefined()
      expect(line!.text).not.toMatch(NO_QUOTIENT)
    }
    // the feed meta line: time, glyph, tag, path with ≥ 20 cells; the test token on the line or its sub-line
    const meta = await ui.find({ key: 'meta:sess-abc-3' })
    expect(meta).toBeDefined()
    expect(meta!.text.length).toBeLessThanOrEqual(columns)
    expect(meta!.text).toMatch(/^\d\d:\d\d [▶✓·] main\s+src\/other\.ts:41/)
    const sub = await ui.find({ key: 'sub:sess-abc-3' })
    expect(`${meta!.text} ${sub?.text ?? ''}`).toMatch(/\+1 −1 · ✓ tested pnpm test/)
    expect((await ui.find({ key: 'meta:sess-abc-1' }))!.text).toMatch(/test-enginee\s+src\/auth\/token\.ts:41/)
    expect((await ui.find({ key: 'meta:sess-abc-2' }))!.text).toMatch(/test-engin#2\s+src\/auth\/token\.ts:41/)
    expect((await ui.find({ key: 'amb:sess-abc-1' }))!.text).toMatch(/ambition \+\d\s+.*\+1 behaviour · \+1 why/)
    expect((await ui.find({ key: 'why:sess-abc-1' }))!.text).toMatch(/why\s+Expiry check used </)
    expect(await ui.find({ type: 'Text', text: /^\s+\+if \(exp <= now\)$/ })).toBeDefined()
    await ui.press({ key: 'mode' })
    expect((await ui.find({ key: 'heading' }))!.text).toMatch(/^FILES · lines as of now/)
    const row = await ui.find({ key: 'frow:src/auth/token.ts' })
    expect(row!.text).toMatch(/^⚠ 2 agents · overlap 41/)
    expect((await ui.find({ key: 'fa:src/auth/token.ts:a' }))!.text).toMatch(/test-enginee\s+41⚠\s+last \d\d:\d\d/)
    expect((await ui.find({ key: 'fa:src/auth/token.ts:b' }))!.text).toMatch(/test-engin#2\s+41⚠/)
    await ui.press({ key: 'mode' })
    await ui.unmount()
  }
  // Subagent edits do not open the pane; main's does. Agents persist with their tags.
  expect(state.opened).toEqual(['code-tracer'])
  const stored = state.written[`${DIR}/sess-abcdef12.jsonl`]!
  expect(stored).toBeDefined()
  const rows = stored.split('\n').map(l => JSON.parse(l) as { kind: string; tag?: string; agentId?: string })
  expect(rows.filter(r => r.kind === 'agent').map(r => r.tag)).toEqual(['main', 'test-enginee', 'test-engin#2'])
})

test('main runs then idles; a Bash-only agent shows its last action; the filtered file view keeps the conflict mark', async ($, on) => {
  const { clock } = world(on)
  await start($, clock)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  let ui = await $.ui.mount(pane(70))
  expect((await ui.find({ key: 'state:main' }))!.text).toMatch(/^▶ running 0m · 0 changes/)
  await ui.unmount()
  await complete($, undefined)
  await clock.settle()
  ui = await $.ui.mount(pane(70))
  expect((await ui.find({ key: 'state:main' }))!.text).toMatch(/^· idle · 0 changes/)
  await ui.unmount()

  await spawn($, 'r', 'agent-protocols:code-reviewer')
  await bash($, 'r', 'tu1', 'cd /repo && rg tokenExpiry src')
  await spawn($, 'a')
  await spawn($, 'b')
  await edit($, 'a', 'tu2', '/repo/src/shared.ts', 'x', 'y')
  await edit($, 'b', 'tu3', '/repo/src/shared.ts', 'y', 'z')
  await edit($, 'b', 'tu4', '/repo/src/only-b.ts', 'p', 'q')
  await complete($, 'a')
  await clock.settle()

  ui = await $.ui.mount(pane(70))
  expect((await ui.find({ key: 'filter:r' }))!.text).toMatch(/code-reviewe/)
  expect((await ui.find({ key: 'state:r' }))!.text).toMatch(/^▶ running/)
  expect((await ui.find({ key: 'last:r' }))!.text).toMatch(/last \d\d:\d\d Bash rg tokenExpiry src$/)
  expect((await ui.find({ key: 'ev:r' }))!.text).toMatch(/0 edits · 1 read · claude-haiku-5-5 · r$/)
  await ui.press({ key: 'filter:a' })
  await ui.press({ key: 'mode' })
  expect((await ui.find({ key: 'frow:src/shared.ts' }))!.text).toMatch(/⚠ 2 agents · overlap 41/)
  expect(await ui.find({ key: 'frow:src/only-b.ts' })).toBeUndefined() // a never touched it
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'frow:src/only-b.ts' })).toBeDefined()
  expect((await ui.find({ key: 'frow:src/only-b.ts' }))!.text).toMatch(/1 agent/)
  await ui.press({ key: 'path:src/only-b.ts' })
  expect((await ui.find({ key: 'heading' }))!.text).toMatch(/^CHANGES · src\/only-b\.ts/)
  expect(await ui.find({ key: 'meta:sess-abc-3' })).toBeDefined()
  expect(await ui.find({ key: 'meta:sess-abc-2' })).toBeUndefined()
  await ui.unmount()
})

test('a failed then passing run shows ✓ once; README gets no test token; export carries the signed sum', async ($, on) => {
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
  expect((await ui.find({ key: 'meta:sess-abc-1' }))!.text).toMatch(/✗ tested vitest/)
  expect((await ui.find({ key: 'head' }))!.text).toMatch(/tests ran after 1 of 3/)
  await ui.unmount()
  await bash($, undefined, 'tu5', 'npx vitest run')
  await clock.settle()
  ui = await $.ui.mount(pane(90))
  const parse = await ui.find({ key: 'meta:sess-abc-1' })
  expect(parse!.text).toMatch(/src\/parse\.ts:1-3\s+\+3 −0 · ✓ tested vitest · new$/)
  expect(parse!.text).not.toMatch(/✗/)
  expect((await ui.find({ key: 'head' }))!.text).toMatch(/tests ran after 1 of 3 · 2 no why/)
  expect((await ui.find({ key: 'meta:sess-abc-3' }))!.text).not.toMatch(/tested/)
  expect((await ui.find({ key: 'amb:sess-abc-1' }))!.text).toMatch(/ambition \+\d+\s+\+2 adds export parse · \+2 test touched src\/parse\.test\.ts · \+2 imported by 3 · \+1 behaviour · \+1 why · \+2 ✓ tested vitest/)
  expect((await ui.find({ key: 'amb:sess-abc-3' }))!.text).toMatch(/ambition \+\d+\s+.*reach unknown/)
  expect((await ui.find({ key: 'why:sess-abc-3' }))!.text).toMatch(/^\s+why —$/)
  await ui.press({ key: 'more:sess-abc-1' })
  expect(await ui.find({ type: 'Text', text: /@@ 1,0 → 1,3/ })).toBeDefined()
  await ui.unmount()

  const r = await $.command.run({ command: 'code-tracer', args: 'export', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as never)
  expect(r.text).toContain(`${DIR}/sess-abcdef12.md`)
  const md = state.written[`${DIR}/sess-abcdef12.md`] ?? ''
  expect(md).toContain('## main')
  expect(md).toContain('### src/parse.ts:1-3')
  expect(md).toContain('**Why:** Add a parser so callers stop hand-rolling it.')
  expect(md).toMatch(/\*\*Ambition \+\d+:\*\* \+2 adds export parse/)
  expect(md).not.toMatch(NO_QUOTIENT)
})

test('the reflector reviews weak changes after a main turn, feeds open findings forward and closes them on a touch', { options: { reflector: true } }, async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  state.importers = 0
  await edit($, undefined, 'tu1', '/repo/src/weak.ts', 'foo( a )', 'foo(a)') // cosmetic, no why: a candidate
  await clock.settle()
  state.reply = 'Sure:\n[{"changeId":"sess-abc-1","kind":"scope","suggestion":"Make the edit change behaviour or drop it."}]'
  await complete($, undefined)
  await clock.settle()
  expect(state.asked).toHaveLength(1)
  expect(state.asked[0]).toContain('changeId: sess-abc-1')

  let ui = await $.ui.mount(pane(70))
  expect((await ui.find({ key: 'head2' }))!.text).toMatch(/1 to improve$/)
  expect((await ui.find({ key: 'imp:sess-abc-r1' }))!.text).toMatch(/↳ scope\s+Make the edit change behaviour or drop it\./)
  await ui.unmount()
  const composed = await $.prompt.compose(COMPOSE)
  expect(composed.sections.map(s => s.id)).toEqual(['base', 'code-tracer:reflector'])
  expect(composed.sections[1]!.text).toContain('- [scope] src/weak.ts: Make the edit change behaviour or drop it. (change sess-abc-1)')
  const stored = state.written[`${DIR}/sess-abcdef12.jsonl`]!
  expect(stored).toContain('"kind":"improvement"')

  // a turn with no new change asks nothing; a later edit of the same path closes the finding
  await complete($, undefined)
  await clock.settle()
  expect(state.asked).toHaveLength(1)
  state.reply = '[]'
  await edit($, undefined, 'tu2', '/repo/src/weak.ts', 'foo(a)', 'bar(a)')
  await clock.settle()
  ui = await $.ui.mount(pane(70))
  expect(await ui.find({ key: 'imp:sess-abc-r1' })).toBeUndefined()
  expect((await ui.find({ key: 'head2' }))!.text).not.toMatch(/to improve/)
  await ui.unmount()
  expect((await $.prompt.compose(COMPOSE)).sections.map(s => s.id)).toEqual(['base'])
})

test('with the reflector off nothing is asked; /code-tracer reflect runs one review on demand', async ($, on) => {
  const { clock, state } = world(on)
  await start($, clock)
  state.importers = 0
  await edit($, undefined, 'tu1', '/repo/src/weak.ts', 'foo( a )', 'foo(a)')
  await complete($, undefined)
  await clock.settle()
  expect(state.asked).toHaveLength(0)
  state.reply = '[{"changeId":"sess-abc-1","kind":"cleanup","suggestion":"Remove the no-op edit."}]'
  const r = await $.command.run({ command: 'code-tracer', args: 'reflect', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as never)
  expect(r.text).toBe('code-tracer: 1 improvement added; see the pane.')
  expect(state.asked).toHaveLength(1)
  const again = await $.command.run({ command: 'code-tracer', args: 'reflect', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as never)
  expect(again.text).toBe('code-tracer: nothing to improve among the unreviewed changes.')
  expect(state.asked).toHaveLength(1)
})
