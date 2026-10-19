import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, PromptOrigin, Register } from 'claude-code'

import type { Tally } from '../types'
import { countDrafts, detect, isYes, type Drafts, type Kind } from './detect'

const ZERO: Tally = { win: 0, pitfall: 0 }
const tally = atom({ plugin: 'lessons', key: 'tally' } as const, ZERO)
const SKILL: Record<Kind, string> = { win: 'win-logger', pitfall: 'pitfall-logger' }
const COOLDOWN = 5 // typed prompts between two nudges of one kind
const KEEP = 10 // typed prompts remembered for the repeat check
const SYNCED = 'Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin' // the desktop app's synced skills

type Source = { ref: string; how: 'loaded' | 'file' } | null
const NONE: Drafts = { win: 0, pitfall: 0 }
const NEVER: Record<Kind, number> = { win: -Infinity, pitfall: -Infinity }

// Session memory. Module scope: the loader allows $ only in top-level functions.
const s = {
  recent: [] as string[],
  pending: NONE,
  lastNudge: { ...NEVER },
  promptIndex: 0,
  skills: { win: null, pitfall: null } as Record<Kind, Source>,
}

async function isOn($: Engine) {
  return (await $.store.get('enabled')) !== false
}

function show($: Engine, t: Tally) {
  $.ui.status(t.win || t.pitfall ? `🌱 ${t.win} · ⚠ ${t.pitfall}` : undefined)
}

// <home>/<SYNCED>/<id>/<id>/skills/<name>/SKILL.md, newest first.
async function findFile($: Engine, name: string) {
  const home = await $.env.get('HOME')
  if (!home) return undefined
  const root = `${home}/${SYNCED}`
  const found: { path: string; at: number }[] = []
  try {
    for (const a of await $.fs.list(root)) {
      if (a.kind !== 'dir') continue
      for (const b of await $.fs.list(`${root}/${a.name}`)) {
        if (b.kind !== 'dir') continue
        const path = `${root}/${a.name}/${b.name}/skills/${name}/SKILL.md`
        if (await $.fs.exists(path)) found.push({ path, at: (await $.fs.stat(path)).mtimeMs })
      }
    }
  } catch {
    return undefined // no desktop app folder (another OS, or no access)
  }
  return found.sort((x, y) => y.at - x.at)[0]?.path
}

async function resolve($: Engine, kind: Kind): Promise<Source> {
  const name = SKILL[kind]
  const cmd = (await $.command.list()).find(c => c.name === name || c.name.endsWith(`:${name}`))
  if (cmd) return { ref: cmd.name, how: 'loaded' }
  const path = await findFile($, name)
  if (path) return { ref: path, how: 'file' }
  await warnMissing($, name)
  return null
}

// Once per skill per day, never while off: an install without the skills would toast at every start and reload.
async function warnMissing($: Engine, name: string) {
  if (!(await isOn($))) return
  const key = `warned:${name}`
  const today = new Date(await $.clock.now()).toISOString().slice(0, 10)
  if ((await $.store.get(key)) === today) return
  await $.store.set(key, today)
  $.ui.toast(`lessons: ${name} skill not found (/lessons status)`)
}

async function resolveAll($: Engine) {
  try {
    s.skills = { win: await resolve($, 'win'), pitfall: await resolve($, 'pitfall') }
  } catch {
    // a refused command.list or env read leaves skills unresolved; /lessons status says missing
  }
}

const note = (kind: Kind, reason: string, src: NonNullable<Source>) =>
  `[lessons] ${kind} signal (${reason}). Finish the request first. ` +
  (src.how === 'loaded' ? `Then follow the ${src.ref} skill` : `Then read ${src.ref} and follow it`) +
  ': it drafts the entry and asks "Log it? y/n". Never write without a yes.'

const where = (src: Source) => (!src ? 'missing' : src.how === 'loaded' ? `loaded as ${src.ref}` : `file ${src.ref}`)

// The person's own words: the terminal, Remote Control, the owner's Slack ping, or the desktop app (an SDK host).
async function isPerson($: Engine, origin: PromptOrigin) {
  return origin.kind === 'composer' || origin.kind === 'bridge' || origin.kind === 'slack-ping' ||
    (origin.kind === 'sdk' && (await $.session.surfaces()).includes('desktop'))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lessons',
      description: 'lessons: win/pitfall logging nudges on or off',
      argumentHint: 'on | off | status',
    })
    void resolveAll($) // never hold the session's start for a folder walk
    show($, await read($, tally))
    return next(e)
  })

  on('command.run', { command: 'lessons' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    const t = await read($, tally)
    const state = (await isOn($)) ? 'on' : 'off'
    return {
      text: `lessons is ${state}. This session: ${t.win} wins, ${t.pitfall} pitfalls logged. win-logger: ${where(s.skills.win)}. pitfall-logger: ${where(s.skills.pitfall)}.`,
    }
  })

  // Only what the person types counts: the terminal, Remote Control, Slack, or the desktop app.
  on('prompt.submit', async ($, e, next) => {
    if (!(await isPerson($, e.origin))) return next(e)
    s.promptIndex += 1

    if ((s.pending.win || s.pending.pitfall) && isYes(e.text)) {
      const add = s.pending
      await update($, tally, t => ({ win: t.win + add.win, pitfall: t.pitfall + add.pitfall }))
      show($, await read($, tally))
    }
    s.pending = NONE

    const hit = (await isOn($)) ? detect(e.text, s.recent) : null
    s.recent = [...s.recent, e.text].slice(-KEEP)
    const src = hit ? s.skills[hit.kind] : null
    if (!hit || !src || s.promptIndex - s.lastNudge[hit.kind] < COOLDOWN) return next(e)
    s.lastNudge[hit.kind] = s.promptIndex
    return next({ ...e, context: [...(e.context ?? []), note(hit.kind, hit.reason, src)] })
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer') return result
    const d = countDrafts(e.answer)
    if (d.win || d.pitfall) s.pending = d // a notification or peer turn in between must not wipe drafts awaiting y/n
    return result
  })

  // /clear and resume: a new conversation starts a new tally.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      s.recent = []
      s.pending = NONE
      s.lastNudge = { ...NEVER }
      await update($, tally, () => ZERO)
      $.ui.status(undefined)
    }
    return next(e)
  })
}
