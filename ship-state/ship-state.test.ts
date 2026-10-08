import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { COMMIT_PROMPT, PUSH_PROMPT } from './hooks/lib.ts'

const T0 = Date.parse('2026-10-07T20:00:00Z')
const BAND = (isWorking: boolean) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
})
const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const fail = { value: { exitCode: 1, stdout: '', stderr: 'no', isStdoutTruncated: false, isStderrTruncated: false } }

// The engine beneath the plugin: one repo at /repo on main; `git.dirty` changed files, `git.ahead` unpushed commits; no gh.
const engine = (on: On, git: { dirty: number; ahead: number; refuseSubmit?: boolean }) => {
  const clock = mock.clock(on, { now: T0 })
  const submitted: string[] = []
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('process.run', async ($, e) => {
    const a = e.argv.join(' ')
    if (!a.startsWith('git ')) return fail // gh --version, gh api, gh pr view
    if (a.includes('--show-toplevel')) return ok('/repo')
    if (a.includes('rev-parse @{u}')) return fail // no upstream data for CI
    if (a.includes('rev-parse HEAD')) return ok('b8afa63aaaaaaaa')
    if (a.includes('symbolic-ref')) return ok('main')
    if (a.includes('status --porcelain')) return ok(Array.from({ length: git.dirty }, (_, i) => ` M f${i}.ts`).join('\n'))
    if (a.includes('rev-list')) return ok(`0\t${git.ahead}`)
    return ok('')
  })
  on('prompt.submit', async ($, e) => {
    if (git.refuseSubmit) throw new Error('a dialog is up')
    submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Text', children: ['beneath'] }))
  return { clock, submitted, git }
}

const start = async ($: Engine, clock: { settle: () => Promise<void> }, surface: 'terminal' | 'desktop') => {
  await $.session.start({ cwd: '/repo', surface, isInteractive: true } as never)
  await clock.settle() // the first refresh is not awaited
}

const finishTurn = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'Committed.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId })

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine, isWorking = false) => $.ui.mount({ plugin: 'ship-state', surface, component: 'AbovePrompt', props: BAND(isWorking) })

  test(`a dirty tree ends the band with the commit button (${surface})`, async ($, on) => {
    const { clock } = engine(on, { dirty: 3, ahead: 0 })
    const ui = await mount($)
    await start($, clock, surface)
    const button = await ui.find({ key: 'act' })
    expect(button).toBeDefined()
    expect(button?.props.label).toBe('commit 3 files')
    expect(button?.props.hotkey).toBe('0')
    expect(await ui.find({ text: 'beneath' })).toBeDefined()
  })

  test(`a press submits the commit prompt once, hides the button, and push follows a clean turn (${surface})`, async ($, on) => {
    const { clock, submitted, git } = engine(on, { dirty: 3, ahead: 2 })
    const ui = await mount($)
    await start($, clock, surface)
    await ui.press({ key: 'act' })
    await clock.settle()
    expect(submitted).toEqual([COMMIT_PROMPT])
    expect(await ui.find({ key: 'act' })).toBeUndefined()
    await expect(ui.press({ key: 'act' })).rejects.toThrow() // nothing to press: the kit refuses, no second submit
    await clock.settle()
    expect(submitted).toEqual([COMMIT_PROMPT])
    git.dirty = 0 // the commit landed
    await finishTurn($)
    await clock.settle()
    const button = await ui.find({ key: 'act' })
    expect(button?.props.label).toBe('push ↑2')
    await ui.press({ key: 'act' })
    await clock.settle()
    expect(submitted).toEqual([COMMIT_PROMPT, PUSH_PROMPT])
  })

  test(`a subagent's turn does not bring the button back; 60 s does (${surface})`, async ($, on) => {
    const { clock, git } = engine(on, { dirty: 3, ahead: 0 })
    const ui = await mount($)
    await start($, clock, surface)
    await ui.press({ key: 'act' })
    await clock.settle()
    await finishTurn($, 'agent-1')
    await clock.settle()
    expect(await ui.find({ key: 'act' })).toBeUndefined()
    await clock.advance(61_000)
    await clock.settle()
    expect(git.dirty).toBe(3)
    expect((await ui.find({ key: 'act' }))?.props.label).toBe('commit 3 files')
  })

  test(`a refused submit shows the button again at once (${surface})`, async ($, on) => {
    const { clock, submitted } = engine(on, { dirty: 1, ahead: 0, refuseSubmit: true })
    const ui = await mount($)
    await start($, clock, surface)
    await ui.press({ key: 'act' })
    await clock.settle()
    expect(submitted).toEqual([])
    expect((await ui.find({ key: 'act' }))?.props.label).toBe('commit 1 file')
  })

  test(`the age appears after 5 minutes dirty (${surface})`, async ($, on) => {
    const { clock } = engine(on, { dirty: 2, ahead: 0 })
    const ui = await mount($)
    await start($, clock, surface)
    await clock.advance(24 * 60_000) // the 20 s tick refreshes; dirtySince stays at T0
    await clock.settle()
    expect((await ui.find({ key: 'act' }))?.props.label).toBe('commit 2 files · 24m ago')
  })

  test(`no button while a turn runs (${surface})`, async ($, on) => {
    const { clock } = engine(on, { dirty: 3, ahead: 0 })
    const ui = await mount($, true)
    await start($, clock, surface)
    expect(await ui.find({ key: 'act' })).toBeUndefined()
    expect(await ui.find({ text: '3 dirty' })).toBeDefined()
  })

  test(`no button when clean and nothing is ahead (${surface})`, async ($, on) => {
    const { clock } = engine(on, { dirty: 0, ahead: 0 })
    const ui = await mount($)
    await start($, clock, surface)
    expect(await ui.find({ key: 'act' })).toBeUndefined()
    expect(await ui.find({ text: 'clean' })).toBeDefined()
  })
}
