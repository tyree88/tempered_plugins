import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { View } from '../types'
import { SYSTEM, buildAsk, parseOptions } from './ask'

const EMPTY: View = { seq: 0, options: [], isDraft: false }
const view = atom({ plugin: 'followups', key: 'view' } as const, EMPTY)

const fit = (text: string, width: number) => (text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text)

export const register: Register = on => {
  let host: Engine | undefined
  let seq = 0 // bumps on every prompt; a Haiku reply for an older seq is dropped
  let lastPrompt = ''
  let isDraft = false // mirrors view.isDraft so prompt.edit writes state only on a change
  let hasSurface = false // a band drew in this process: skips the call under -p / SDK hosts
  let lastError = ''

  const isOn = async ($: Engine) => (await $.store.get('enabled')) !== false
  const setDraft = async ($: Engine, value: boolean) => {
    isDraft = value
    await update($, view, v => ({ ...(v ?? EMPTY), isDraft: value }))
  }

  const suggest = async ($: Engine, answer: string) => {
    const mine = seq
    const reply = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 300,
      timeoutMs: 8000,
      system: SYSTEM,
      prompt: buildAsk(lastPrompt, answer),
    })
    if (mine !== seq) return
    if (!reply.isAnswered) {
      lastError = reply.reason
      return
    }
    const options = parseOptions(reply.text)
    lastError = options.length >= 2 ? '' : 'unparseable reply'
    if (options.length >= 2) await update($, view, v => ({ ...(v ?? EMPTY), seq: mine, options }))
  }

  const pick = async ($: Engine, text: string) => {
    const filled = await $.prompt.fill({ text, mode: 'replace' })
    if (filled.isFilled) await setDraft($, true) // a fill is not a prompt.edit
  }

  on('session.start', async ($, e, next) => {
    host = $
    isDraft = (await read($, view)).isDraft
    await $.command.register({
      name: 'followups',
      description: 'followups: next-prompt options above the prompt box on or off',
      argumentHint: 'on | off | status',
    })
    return next(e)
  })

  on('command.run', { command: 'followups' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    if (arg === 'off') await update($, view, v => ({ ...(v ?? EMPTY), options: [] }))
    const state = (await isOn($)) ? 'on' : 'off'
    return { text: `followups is ${state}.${lastError ? ` Last error: ${lastError}.` : ''}` }
  })

  on('prompt.submit', async ($, e, next) => {
    seq += 1
    lastPrompt = e.text
    isDraft = false
    await update($, view, () => ({ seq, options: [], isDraft: false }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer' || !e.answer.trim() || !hasSurface || !(await isOn($))) return result
    void suggest(host ?? $, e.answer) // never hold the turn's end for Haiku
    return result
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const hasText = box.text !== ''
    if (hasText !== isDraft) await setDraft($, hasText)
    return box
  })

  // The band replaces the engine's single grey guess. Plugin suggestions pass.
  on('prompt.suggest', { origin: { kind: 'suggestion' } }, async ($, e, next) =>
    (await isOn($)) ? { isShown: false } : next(e),
  )

  // Stacks: our rows, then whatever the plugins beneath drew (ship-state's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    hasSurface = true
    const beneath = await next(e)
    const v = await read($, view)
    if (e.props.hasSurvey || e.props.isWorking || v.isDraft || v.options.length === 0) return beneath

    const { Box, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns - 3 // "1: "
    return (
      <Box flexDirection="column">
        {v.options.map((text, i) => (
          <Button
            key={`opt${i + 1}`}
            hotkey={String(i + 1)}
            plain
            label={fit(text, width)}
            onPress={() => pick($, text)}
          />
        ))}
        {beneath}
      </Box>
    )
  })
}
