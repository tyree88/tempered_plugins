import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const T0 = Date.UTC(2026, 9, 7, 12)
const iso = (min: number) => new Date(T0 - min * 60_000).toISOString()
const DIR = '/home/.claude/timelines/'
const PLAN = '/docs/pane-plan.md'
const PLAN_TEXT = '# Pane Redesign Implementation Plan\n\n## Task 1\n- [x] a\n- [x] b\n## Task 2: Wire it in\n- [ ] c\n- [ ] d\n'
const LONG = 'a fairly long title that wraps at narrow widths so the layout has to cope with it'

// Another session's log: one agent it started 3 days ago and never ended (that session died), then 6 done steps.
const OTHER = [
  { v: 1, id: 'other-0', at: iso(3 * 24 * 60), session: 'other', kind: 'agent', title: 'Stale agent', agent: { id: 'stale', phase: 'start' } },
  ...Array.from({ length: 6 }, (_, i) => ({
    v: 1, id: `other-${i + 1}`, at: iso(300 - i), session: 'other', kind: 'work', title: `step ${i} ${LONG}`, task: `t${i}`, status: 'done',
  })),
]
const OTHER_JSONL = `${OTHER.map(e => JSON.stringify(e)).join('\n')}\n`

// What TaskList answers: 1 in progress, 7 ready, 1 waiting on #1.
const LISTED = [
  { id: '1', subject: `Build the pane: ${LONG}`, status: 'in_progress', blockedBy: [] },
  ...[2, 3, 4, 5, 6, 7, 8].map(n => ({ id: String(n), subject: `Pending ${n}`, status: 'pending', blockedBy: [] })),
  { id: '9', subject: 'Wire the pane', status: 'pending', blockedBy: ['1'] },
]

// The engine beneath the plugin: one git repo at /repo, a timeline folder holding `files`, a plan file.
const engine = (on: On, files: Record<string, string> = {}) => {
  mock.store(on)
  mock.env(on, { HOME: '/home' })
  const clock = mock.clock(on, { now: T0 })
  const opened: string[] = []
  let created = 0
  on('session.id', async () => ({ value: 'sess-abcdef12' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('prompt.compose', async () => {
    throw new Error('none')
  })
  on('tool.register', async ($, e) => ({ value: { tool: `mcp__timeline__${e.name}` } }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('process.run', async ($, e) => {
    const a = e.argv.join(' ')
    const stdout = a.startsWith('date') ? '+0000' : a.includes('rev-parse') ? '/repo/.git\n/repo' : a.includes('symbolic-ref') ? 'feat/timeline-pane' : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.list', async ($, e) => {
    if (!e.path.startsWith(DIR)) throw new Error('ENOENT')
    return { value: Object.entries(files).map(([name, text]) => ({ name, kind: 'file' as const, mtimeMs: 1, size: text.length, isLink: false })) }
  })
  on('fs.read', async ($, e) => {
    const name = e.path.slice(e.path.lastIndexOf('/') + 1)
    if (e.path.startsWith(DIR) && files[name] !== undefined) return { value: files[name] }
    if (e.path === PLAN) return { value: PLAN_TEXT }
    throw new Error('ENOENT')
  })
  on('fs.stat', async ($, e) => {
    if (e.path === PLAN) return { value: { kind: 'file', size: PLAN_TEXT.length, mtimeMs: 5, isLink: false } }
    throw new Error('ENOENT')
  })
  on('fs.write', async () => ({ value: undefined }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.open', async ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.toast', async () => ({ value: undefined }))
  on('tool.call', async ($, e) => {
    if (e.tool === 'TaskList') return { result: { tasks: LISTED }, text: 'listed' }
    if (e.tool === 'TaskCreate') return { result: 'created', text: `Task #${++created} created successfully: ${String(e.subject)}` }
    if (e.tool === 'Read') return { result: 'read', text: PLAN_TEXT }
    return { result: 'ok', text: 'ok' }
  })
  on('agent.spawn', async ($, e) => ({ model: 'claude-sonnet-5', agentId: `agent-${e.description.length}` }))
  return { clock, opened }
}

const PANE = (bodyColumns: number) => ({
  title: 'Timeline',
  isFocused: false,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
})

const start = async ($: Engine, clock: { settle: () => Promise<void> }) => {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await clock.settle() // the first timeline read is not awaited
}

const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as never)

const spawn = ($: Engine, description: string) =>
  $.agent.spawn({
    tool_use_id: `tu-${description}`,
    prompt: 'do it',
    description,
    subagentType: 'general-purpose',
    provider: { kind: 'engine' },
    parentModel: 'claude-opus-5-5',
    background: false,
  } as never)

const HISTORY_ROW = /^\d\d:\d\d /

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine, columns: number) =>
    $.ui.mount({ plugin: 'timeline', surface, component: 'Pane', requestId: 'timeline', props: PANE(columns) })

  for (const columns of [100, 50]) {
    test(`task calls fill NOW and NEXT at ${columns} columns (${surface})`, async ($, on) => {
      const { clock, opened } = engine(on)
      await start($, clock)
      await call($, { tool: 'TaskCreate', subject: 'Build pane', description: 'd' })
      await call($, { tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
      await call($, { tool: 'TaskCreate', subject: 'Write test', description: 'd' })
      await clock.settle() // the task hook redraws without waiting
      const ui = await mount($, columns)
      expect(await ui.find({ key: 'now' })).toBeDefined()
      expect(await ui.find({ key: 'next' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▶ Build pane' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '○ Write test' })).toBeDefined()
      expect(opened).toEqual([]) // 2 open tasks: not yet worth opening the pane
    })

    test(`full pane: zones, agents, plan and blocked at ${columns} columns (${surface})`, async ($, on) => {
      const { clock, opened } = engine(on, { 'other.jsonl': OTHER_JSONL })
      await start($, clock)
      await spawn($, 'Review the timeline pane renderer and wiring on the feature branch')
      await spawn($, 'Write docs')
      await call($, { tool: 'Bash', command: 'ls', agentId: 'agent-66' }) // a subagent's call feeds `now:` and its count
      await call($, { tool: 'TaskList' })
      await call($, { tool: 'Read', file_path: PLAN })
      await clock.advance(125_000)
      await call($, { tool: 'TaskList' }) // redraw with the elapsed time
      await clock.settle()
      const ui = await mount($, columns)

      for (const key of ['goal', 'plan', 'now', 'next', 'blocked', 'history']) expect(await ui.find({ key }), key).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'GOAL Pane Redesign' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^PLAN █+░+ Task 2: Wire it in · 2\/4 steps$/ })).toBeDefined()
      // NOW: both live agents (the 3-day-old one from a dead session is history only) and the task in progress
      expect(await ui.find({ key: 'agent-agent-66' })).toBeDefined()
      expect(await ui.find({ key: 'agent-agent-10' })).toBeDefined()
      expect(await ui.find({ key: 'agent-stale' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /general-purpose · claude-sonnet-5 · 2m05s · 1 tool$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'now: Bash ls' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^▶ Build the pane/ })).toBeDefined()
      // NEXT shows 5 of 7 ready; BLOCKED names what #9 waits on
      expect(await ui.findAll({ type: 'Text', text: /^○ Pending \d$/ })).toHaveLength(5)
      expect(await ui.find({ type: 'Text', text: '+2 more' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '⚠ Wire the pane — waits on #1' })).toBeDefined()
      // wide: NEXT and BLOCKED side by side; narrow: stacked
      expect((await ui.find({ key: 'side' }))?.props.flexDirection).toBe(columns >= 70 ? 'row' : 'column')
      // history: 2 spawns + 7 from the other session, no session open/close rows
      expect(await ui.findAll({ type: 'Text', text: HISTORY_ROW })).toHaveLength(9)
      expect(await ui.find({ type: 'Text', text: /session .* opened/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /No activity yet/ })).toBeUndefined()
      expect(opened).toEqual(['timeline']) // the first main-loop spawn opened it, once
    })
  }

  test(`a subagent's TaskCreate stays off the pane (${surface})`, async ($, on) => {
    const { clock } = engine(on)
    await start($, clock)
    await call($, { tool: 'TaskCreate', subject: 'Sub task', description: 'd', agentId: 'agent-x' })
    await clock.settle()
    const ui = await mount($, 100)
    expect(await ui.find({ text: 'Sub task' })).toBeUndefined()
    expect(await ui.find({ key: 'next' })).toBeUndefined()
  })

  test(`more than 30 history rows page with older and newer (${surface})`, async ($, on) => {
    const { clock } = engine(on)
    await start($, clock)
    for (let i = 0; i < 35; i++) await call($, { tool: 'mcp__timeline__log', kind: 'talk', title: `asked ${i}` })
    const ui = await mount($, 100)
    expect(await ui.findAll({ type: 'Text', text: HISTORY_ROW })).toHaveLength(30)
    expect(await ui.find({ type: 'Text', text: /asked 34$/ })).toBeDefined() // newest first
    expect(await ui.find({ key: 'newer' })).toBeUndefined()
    await ui.press({ key: 'older' })
    expect(await ui.findAll({ type: 'Text', text: HISTORY_ROW })).toHaveLength(5)
    expect(await ui.find({ type: 'Text', text: /asked 0$/ })).toBeDefined()
    expect(await ui.find({ key: 'older' })).toBeUndefined()
    await ui.press({ key: 'newer' })
    expect(await ui.find({ key: 'older' })).toBeDefined()
  })

  test(`empty state with no tasks and no entries (${surface})`, async ($, on) => {
    const { clock } = engine(on)
    await start($, clock)
    await call($, { tool: 'TodoWrite', todos: [] }) // a main-loop task call: redraws with nothing
    await clock.settle()
    const ui = await mount($, 60)
    // Keys on a Text are not in the drawn tree: find it by its text.
    expect(await ui.find({ type: 'Text', text: /^No activity yet\./ })).toBeDefined()
    for (const key of ['now', 'next', 'history']) expect(await ui.find({ key }), key).toBeUndefined()
  })
}
