import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = 1_800_000_000
const DAY = 86_400
const SURFACES = ['terminal', 'desktop'] as const
const RISKY = '/w/app/.wt/risky'

const PANE = {
  plugin: 'worktrees',
  component: 'Pane',
  requestId: 'worktrees',
  props: {
    title: 'Worktrees',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const COMMAND = {
  command: 'worktrees',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 120 },
} as const

const wt = (path: string, branch: string) => [`P\tworktree ${path}`, 'P\tHEAD a', `P\tbranch refs/heads/${branch}`, 'P\t']

const scanOutput = (withNew: boolean) =>
  [
    `N\t${NOW}`,
    'R\t/w/app\tmain\torigin',
    ...wt('/w/app', 'main'),
    ...wt(RISKY, 'risky'),
    ...wt('/w/app/.wt/old', 'old'),
    ...(withNew ? wt('/w/app/.wt/stripe-retry', 'claude/stripe-retry') : []),
    `B\tmain\t${NOW}\t`,
    `B\trisky\t${NOW - 41 * DAY}\t`,
    `B\told\t${NOW - 41 * DAY}\t`,
    `B\tclaude/stripe-retry\t${NOW}\t`,
    `S\t/w/app\t0\t0\t0`,
    `S\t${RISKY}\t2\t${NOW - 41 * DAY}\t0`,
    'S\t/w/app/.wt/old\t0\t0\t0',
    `S\t/w/app/.wt/stripe-retry\t0\t0\t0`,
  ].join('\n')

const done = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// git and the model, answered beneath the mod; every git argv is recorded.
const world = (on: On) => {
  mock.store(on)
  const clock = mock.clock(on)
  const state = { withNew: false, toasts: [] as string[], git: [] as string[][], prompts: [] as string[] }
  on('process.run', (_, e) => {
    const [cmd, ...args] = e.argv
    if (cmd === 'sh') return done(scanOutput(state.withNew))
    state.git.push(args)
    const verb = args.filter(arg => !arg.startsWith('--'))[0]
    if (verb === 'status') return done(' M src/a.ts\0?? .env\0')
    if (verb === 'diff' && args.includes('--name-only')) return done('src/a.ts\0')
    if (verb === 'diff') return done('diff --git a/src/a.ts b/src/a.ts\n+retry()')
    if (verb === 'rev-parse') return done('abc1234\n')
    return done()
  })
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 10, mtimeMs: 0, isLink: false } }))
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: 'Add retry to webhook',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  on('ui.toast', (_, e) => {
    state.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.fill', (_, e) => {
    state.prompts.push(e.text)
    return { isFilled: true }
  })
  on('classic.WorktreeCreate', () => ({}))
  return { clock, state }
}

test('red marks only at-risk rows; a created worktree is toasted and tagged new', async ($, on) => {
  const { clock, state } = world(on)
  await $.command.run(COMMAND)
  await clock.advance(10)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /1 at risk/ })).toBeDefined()
    expect(await ui.find({ text: /1 safe to remove/ })).toBeDefined()
    expect(await ui.find({ text: /2 uncommitted · 41d idle/ })).toBeDefined()
    await ui.press({ key: 'filter' })
    expect(await ui.find({ text: /idle 41d/ })).toBeUndefined()
    await ui.press({ key: 'filter' })
    await ui.unmount()
  }
  expect(state.toasts).toHaveLength(0)

  state.withNew = true
  await $.classic.WorktreeCreate({ name: 'stripe-retry' })
  await clock.advance(3_000)
  await clock.settle()
  expect(state.toasts).toEqual(['New worktree: app / stripe-retry'])
})

test('rescue commits the code as WIP, never the secret, and never pushes', async ($, on) => {
  const { clock, state } = world(on)
  await $.command.run(COMMAND)
  await clock.advance(10)

  for (const surface of SURFACES) {
    state.git = []
    state.toasts = []
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: RISKY })
    expect(await ui.find({ text: /Next: / })).toBeDefined()
    await ui.press({ key: `rescue:${RISKY}` })
    await clock.advance(10)
    await clock.settle()

    const add = state.git.find(args => args.includes('add'))
    expect(add).toContain('src/a.ts')
    expect(add).not.toContain('.env')
    const commit = state.git.find(args => args.includes('commit'))
    expect(commit).toContain('wip: Add retry to webhook')
    expect(commit?.join(' ')).toContain('Skipped: .env (secret-like)')
    expect(state.git.some(args => args.includes('push') || args.includes('remove') || args.includes('reset'))).toBe(false)
    expect(state.toasts).toContain('Rescued 1 of 1 in app.')
    expect(await ui.find({ text: /Last rescue: committed abc1234/ })).toBeDefined()
    await ui.press({ key: RISKY })
    await ui.unmount()
  }
})

test('a safe row offers removal as a prompt to edit, not an action', async ($, on) => {
  const { clock, state } = world(on)
  await $.command.run(COMMAND)
  await clock.advance(10)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: '/w/app/.wt/old' })
  await ui.press({ key: 'remove:/w/app/.wt/old' })
  expect(state.prompts[0]).toContain('git worktree remove /w/app/.wt/old` (no --force)')
  expect(state.git.some(args => args.includes('remove'))).toBe(false)
  await ui.unmount()
})
