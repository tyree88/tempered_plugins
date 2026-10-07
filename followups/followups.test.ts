import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const OPTIONS = ['run the checks', 'show the band', 'try the fork', 'commit it']
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

// The engine beneath the plugin: Haiku answers four options, the box takes any fill.
const engine = (on: On) => {
  const asked: string[] = []
  const filled: string[] = []
  mock.store(on)
  on('model.complete', async ($, e) => {
    asked.push(e.prompt)
    const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { value: { isAnswered: true, text: JSON.stringify(OPTIONS), usage } }
  })
  on('prompt.fill', async ($, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  on('prompt.suggest', async () => ({ isShown: true }))
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Text', children: ['beneath'] }))
  return { asked, filled, clock: mock.clock(on) }
}

// A prompt, its turn and its answer, as the engine raises them.
const turn = async ($: Engine, agentId?: string) => {
  await $.prompt.submit({ text: 'add a band', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a band', turnId: 't1' })
  await $.turn.complete({ answer: 'Done: the band draws.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId })
}

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine) => $.ui.mount({ plugin: 'followups', surface, component: 'AbovePrompt', props: BAND })

  test(`draws four options after an answer (${surface})`, async ($, on) => {
    const { asked, clock } = engine(on)
    const ui = await mount($)
    await turn($)
    await clock.settle() // the Haiku call is fire-and-forget
    expect(asked).toHaveLength(1)
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.map(b => b.key)).toEqual(['opt1', 'opt2', 'opt3', 'opt4'])
    expect(buttons.map(b => b.props.label)).toEqual(OPTIONS)
    expect(await ui.find({ text: 'beneath' })).toBeDefined()
  })

  test(`a press fills the prompt with its option (${surface})`, async ($, on) => {
    const { filled, clock } = engine(on)
    const ui = await mount($)
    await turn($)
    await clock.settle()
    await ui.press({ key: 'opt2' })
    expect(filled).toEqual(['show the band'])
  })

  test(`a subagent's answer asks nothing and draws nothing (${surface})`, async ($, on) => {
    const { asked, clock } = engine(on)
    const ui = await mount($)
    await turn($, 'agent-1')
    await clock.settle()
    expect(asked).toHaveLength(0)
    expect(await ui.find({ key: 'opt1' })).toBeUndefined()
  })

  test(`hides the engine's suggestion once a band drew (${surface})`, async ($, on) => {
    engine(on)
    await mount($)
    expect(await $.prompt.suggest({ text: 'next?', origin: { kind: 'suggestion' } })).toEqual({ isShown: false })
    expect(await $.prompt.suggest({ text: 'mine', origin: { kind: 'plugin', name: 'other' } })).toEqual({ isShown: true })
  })
}
