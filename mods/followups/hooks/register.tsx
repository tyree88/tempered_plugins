import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { View } from '../types'
import { SYSTEM, buildAsk, parseOptions } from './ask'

const EMPTY: View = { seq: 0, options: [], isDraft: false }
const view = atom({ plugin: 'followups', key: 'view' } as const, EMPTY)

// Counts code points, so a cut never splits a surrogate pair.
const fit = (text: string, width: number) => {
  const chars = Array.from(text)
  return chars.length > width ? `${chars.slice(0, Math.max(1, width - 1)).join('')}…` : text
}

// Shared by the hooks and the top-level helpers below: the loader lets $ reach only functions declared at the top of this file.
const s = {
  seq: 0, // bumps on every prompt and turn; a Haiku reply for an older seq is dropped
  lastPrompt: '', // the running turn's own prompt (turn.start), not the latest one typed
  isDraft: false, // mirrors view.isDraft so prompt.edit writes state only on a change
  hasSurface: false, // a band drew in this process: skips the call under -p / SDK hosts
  lastError: '',
}

const isOn = async ($: Engine) => (await $.store.get('enabled')) !== false
const setDraft = async ($: Engine, value: boolean) => {
  s.isDraft = value
  await update($, view, v => ({ ...v, isDraft: value }))
}
const syncDraft = async ($: Engine) => {
  const hasText = (await $.prompt.read()).text !== ''
  if (hasText !== s.isDraft) await setDraft($, hasText)
}

const suggest = async ($: Engine, answer: string) => {
  const mine = s.seq
  const reply = await $.model
    .complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 300,
      timeoutMs: 8000,
      system: SYSTEM,
      prompt: buildAsk(s.lastPrompt, answer),
    })
    .catch((err: unknown) => {
      // The engine refused to send (a blocked model, a bad cap): say so in `/followups`.
      s.lastError = err instanceof Error ? err.message : String(err)
      return null
    })
  if (!reply || mine !== s.seq || !(await isOn($))) return // `/followups off` mid-call writes nothing
  if (!reply.isAnswered) {
    s.lastError = reply.reason
    return
  }
  const options = parseOptions(reply.text)
  s.lastError = options.length >= 2 ? '' : 'unparseable reply'
  // update re-runs this on a version miss: re-check seq so a submit in between wins
  if (options.length >= 2) await update($, view, v => (mine === s.seq ? { ...v, seq: mine, options } : v))
}

const pick = async ($: Engine, text: string) => {
  const filled = await $.prompt.fill({ text, mode: 'replace' }).catch(() => null)
  if (!filled?.isFilled) {
    s.lastError = filled?.refusal ? `fill refused: ${filled.refusal}` : 'fill refused'
    return
  }
  await setDraft($, true) // a fill is not a prompt.edit
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    s.isDraft = (await read($, view)).isDraft
    await $.command.register({
      name: 'followups',
      description: 'followups: next-prompt options above the prompt box on or off',
      argumentHint: 'on | off | status',
    })
    return next(e)
  })

  // Registered before `/followups`, so it nests outside it (a plugin's registrations nest in order, first
  // outermost). A local command clears the box with no prompt.edit.
  on('command.run', async ($, e, next) => {
    const out = await next(e)
    void syncDraft($)
    return out
  })

  // /clear and resume start no session.start for the new conversation: drop the old one's options here.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      s.seq += 1
      s.isDraft = false
      await update($, view, () => ({ ...EMPTY, seq: s.seq }))
    }
    return next(e)
  })

  on('command.run', { command: 'followups' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    if (arg === 'off') await update($, view, v => ({ ...v, options: [] }))
    const state = (await isOn($)) ? 'on' : 'off'
    return { text: `followups is ${state}.${s.lastError ? ` Last error: ${s.lastError}.` : ''}` }
  })

  on('prompt.submit', async ($, e, next) => {
    s.seq += 1
    s.isDraft = false
    await update($, view, () => ({ seq: s.seq, options: [], isDraft: false }))
    return next(e)
  })

  // The turn's own prompt: one typed mid-turn fires prompt.submit before this answer lands.
  on('turn.start', async ($, e, next) => {
    s.seq += 1
    if (e.text) s.lastPrompt = e.text // a continuation has no text: keep the last prompt
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer' || !e.answer.trim() || !s.hasSurface || !(await isOn($))) return result
    void suggest($, e.answer) // never hold the turn's end for Haiku
    return result
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const hasText = box.text !== ''
    if (hasText !== s.isDraft) await setDraft($, hasText)
    return box
  })

  // The band replaces the engine's single grey guess. Plugin suggestions pass.
  // Only once a band has drawn: with no band (another plugin above ours, vscode, mobile) it stays.
  on('prompt.suggest', { origin: { kind: 'suggestion' } }, async ($, e, next) =>
    s.hasSurface && (await isOn($)) ? { isShown: false } : next(e),
  )

  // Stacks: our rows, then whatever the plugins beneath drew (ship-state's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    s.hasSurface = true
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
