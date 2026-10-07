import { expect, mock, test } from 'claude-code/testing'
import type { CommandInfo, On, PromptOrigin, RenderSurface } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const SKILLS: CommandInfo[] = [
  { name: 'anthropic-skills:pitfall-logger', description: 'log a pitfall', source: 'plugin' },
  { name: 'anthropic-skills:win-logger', description: 'log a win', source: 'plugin' },
]
const DRAFT = '🌱 Win draft — NEW\nShipped the band in one pass.\n\nLog it? y/n'

// The engine beneath the plugin: these commands loaded, these surfaces attached, an empty home folder, a store and clock in memory.
const engine = (on: On, commands = SKILLS, surfaces: RenderSurface[] = ['terminal']) => {
  const reached: (readonly string[] | undefined)[] = [] // each prompt's context at the bottom of prompt.submit
  const status: (string | undefined)[] = []
  const toasts: string[] = []
  mock.store(on)
  mock.env(on, { HOME: '/empty-home' })
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 7) })
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('command.list', async () => ({ value: commands }))
  on('fs.list', async () => ({ value: [] }))
  on('session.surfaces', async () => ({ value: surfaces }))
  on('ui.status', async ($, e) => (status.push(e.text), { value: undefined }))
  on('ui.toast', async ($, e) => (toasts.push(e.text), { value: undefined }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', async ($, e) => (reached.push(e.context), { text: e.text, context: e.context }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  return { reached, status, toasts, clock }
}

const start = async ($: Engine, clock: { settle: () => Promise<void> }) => {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle() // the skill lookup is fire-and-forget
}
const say = ($: Engine, text: string, origin: PromptOrigin = { kind: 'composer' }) =>
  $.prompt.submit({ text, wait: false, origin })
const answer = ($: Engine, text: string) =>
  $.turn.complete({ answer: text, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
// The engine's $ has no state noun; /lessons status reads the lessons.tally atom.
const tally = async ($: Engine) => (await $.command.run({ command: 'lessons', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text
const lessonsNote = (context: readonly string[] | undefined) => context?.find(c => c.startsWith('[lessons]'))

test('a frustrated typed prompt carries the pitfall nudge naming the skill', async ($, on) => {
  const { reached, clock } = engine(on)
  await start($, clock)
  await say($, 'I already told you no bullets')
  const note = lessonsNote(reached[0])
  expect(note).toStartWith('[lessons] pitfall signal (frustration)')
  expect(note).toContain('anthropic-skills:pitfall-logger')
})

test('an ordinary typed prompt carries no nudge', async ($, on) => {
  const { reached, clock } = engine(on)
  await start($, clock)
  await say($, 'add the button to the header')
  expect(reached).toHaveLength(1)
  expect(lessonsNote(reached[0])).toBeUndefined()
})

test("a plugin's prompt is not the person's: no nudge", async ($, on) => {
  const { reached, clock } = engine(on)
  await start($, clock)
  await say($, 'still wrong', { kind: 'plugin', name: 'other' })
  expect(reached).toHaveLength(1)
  expect(lessonsNote(reached[0])).toBeUndefined()
})

test('cooldown: two frustrated prompts in a row nudge once', async ($, on) => {
  const { reached, clock } = engine(on)
  await start($, clock)
  await say($, 'I already told you no bullets')
  await say($, 'still wrong')
  expect(lessonsNote(reached[0])).toBeDefined()
  expect(lessonsNote(reached[1])).toBeUndefined()
})

test('a yes after a draft adds it to the tally and the status line', async ($, on) => {
  const { status, clock } = engine(on)
  await start($, clock)
  await answer($, DRAFT)
  await say($, 'y')
  expect(await tally($)).toContain('1 wins, 0 pitfalls logged')
  expect(status.at(-1)).toBe('🌱 1 · ⚠ 0')
})

test('drafts survive a notification turn before the yes', async ($, on) => {
  const { status, clock } = engine(on)
  await start($, clock)
  await answer($, DRAFT)
  await say($, '<task-notification>build finished</task-notification>', { kind: 'task-notification' })
  await answer($, 'The background build finished.')
  await say($, 'yes')
  expect(await tally($)).toContain('1 wins, 0 pitfalls logged')
  expect(status.at(-1)).toBe('🌱 1 · ⚠ 0')
})

test('missing skills: no nudge, one toast', async ($, on) => {
  const { reached, toasts, clock } = engine(on, [])
  await start($, clock)
  await say($, 'I already told you no bullets')
  expect(lessonsNote(reached[0])).toBeUndefined()
  expect(toasts).toContain('lessons: pitfall-logger skill not found (/lessons status)')
})

// The desktop app is an SDK host: its prompts are the person's, a bare -p run's are not.
for (const [surface, nudged] of [['desktop', true], ['terminal', false]] as const) {
  test(`an sdk prompt with ${surface} attached ${nudged ? 'carries the' : 'gets no'} nudge`, async ($, on) => {
    const { reached, clock } = engine(on, SKILLS, [surface])
    await start($, clock)
    await say($, 'I already told you no bullets', { kind: 'sdk' })
    const note = lessonsNote(reached[0])
    if (nudged) expect(note).toStartWith('[lessons] pitfall signal (frustration)')
    else expect(note).toBeUndefined()
  })
}
