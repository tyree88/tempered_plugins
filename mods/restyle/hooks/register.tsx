import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Pick as ElementPick, Recipe } from '../types'
import { compose } from './compose.ts'
import { kindsOf, parseLine, rank, score } from './match.ts'
import { drawPane } from './pane'
import type { PaneView, Status } from './pane'
import { parseRecipe } from './recipes.ts'

const PANE = 'restyle'

// $.process.spawn closes the child's stdin at once, and the bridge exits when its stdin closes (plan C2). This
// wrapper holds a pipe open as the bridge's stdin and forwards its output: the bridge lives exactly as long as
// the wrapper, which the engine ends when the loop ends or the module unloads.
const HOLD_STDIN = [
  "const c=require('node:child_process').spawn(process.execPath,[process.argv[1]],{stdio:['pipe','inherit','inherit']})",
  "c.on('error',e=>{console.error(e.message);process.exit(1)})",
  "c.on('exit',code=>process.exit(code??1))",
  "for(const s of ['SIGTERM','SIGINT','SIGHUP'])process.on(s,()=>c.kill('SIGTERM'))",
].join(';')

type Bridge = ReturnType<Engine['process']['spawn']>

// Shared by the hooks and the top-level helpers: the loader lets $ reach only functions declared at the top of this file.
const st = {
  gen: 0, // bumps on every start and stop; a loop of an older bridge writes nothing
  status: 'stopped' as Status,
  error: undefined as string | undefined,
  port: 0,
  token: '',
  hello: undefined as string | undefined,
  pick: undefined as ElementPick | undefined,
  recipes: [] as Recipe[],
  bad: 0,
  notice: undefined as string | undefined,
  stream: undefined as Bridge | undefined,
}

const redraw = ($: Engine) => $.ui.invalidate('ui.render')

const scriptTag = () => `<script src="http://127.0.0.1:${st.port}/picker.js?t=${st.token}"></script>`

const installPrompt = () =>
  [
    "Add this script tag to this web app's dev layout (the root HTML file or the root layout component):",
    '',
    scriptTag(),
    '',
    'Put it behind a development-only check, so it never reaches a production build: use the check the project already has (for example `process.env.NODE_ENV === "development"` or `import.meta.env.DEV`).',
    'The tag loads the restyle picker from a local bridge on 127.0.0.1. It works only while /restyle is running; when it is not, the tag fails to load and does nothing.',
  ].join('\n')

async function loadRecipes($: Engine) {
  const dir = `${$.plugin.root}/recipes`
  const good: Recipe[] = []
  let bad = 0
  for (const cat of (await $.fs.list(dir).catch(() => [])).filter(e => e.kind === 'dir')) {
    for (const f of (await $.fs.list(`${dir}/${cat.name}`).catch(() => [])).filter(e => e.kind === 'file' && e.name.endsWith('.md'))) {
      const text = await $.fs.read(`${dir}/${cat.name}/${f.name}`).catch(() => undefined)
      const parsed = text === undefined ? undefined : parseRecipe(f.name.slice(0, -3), cat.name, text)
      if (parsed?.ok) good.push(parsed.recipe)
      else bad += 1
    }
  }
  st.recipes = good
  st.bad = bad
}

function stopBridge() {
  st.gen += 1
  const stream = st.stream
  st.stream = undefined
  st.status = 'stopped'
  st.hello = undefined
  // Ending the stream is what ends the child (`$.process.spawn`).
  if (stream) void stream.return({ code: null, signal: null }).catch(() => {})
}

// The loop is the bridge's life: it outlives the hook that started it.
async function runBridge($: Engine, gen: number) {
  let stderr = ''
  let failure: string
  try {
    // shortcut: one saved port and token for every project; a second session at the same time gets a fresh port
    // and its own tag. Save per project if that happens often.
    const saved = (await $.store.get('bridge').catch(() => undefined)) as { port?: unknown; token?: unknown } | undefined
    const reuse = typeof saved?.port === 'number' && typeof saved.token === 'string'
    if (gen !== st.gen) return
    const stream = $.process.spawn({
      argv: ['node', '-e', HOLD_STDIN, `${$.plugin.root}/bridge/bridge.mjs`],
      ...(reuse ? { env: { RESTYLE_PORT: String(saved.port), RESTYLE_TOKEN: saved.token as string } } : {}),
    })
    st.stream = stream
    let buffer = ''
    for await (const chunk of stream) {
      if (gen !== st.gen) break
      if (chunk.stream === 'stderr') {
        stderr = (stderr + chunk.text).slice(-400)
        continue
      }
      // A piece can end mid-line: keep the tail for the next one.
      const lines = (buffer + chunk.text).split('\n')
      buffer = lines.pop() ?? ''
      for (const text of lines) {
        const line = parseLine(text)
        if (line?.type === 'ready') {
          st.port = line.port
          st.token = line.token
          st.status = 'ready'
          if (!reuse) void $.store.set('bridge', { port: line.port, token: line.token }).catch(() => {})
        } else if (line?.type === 'hello') st.hello = line.url
        else if (line?.type === 'pick') {
          st.pick = line.pick
          st.notice = undefined
        }
      }
      redraw($)
    }
    const end = await stream.result.catch(() => undefined)
    failure = end ? `The bridge exited (${end.signal ?? `code ${end.code}`})` : 'The bridge stopped'
  } catch (error) {
    // No `node` on the PATH, or the spawn refused: the first pull rejects.
    failure = `The bridge did not start: ${error instanceof Error ? error.message : String(error)}`
  }
  if (gen !== st.gen) return
  st.stream = undefined
  st.status = 'failed'
  st.error = stderr.trim() ? `${failure}: ${stderr.trim()}` : `${failure}.`
  redraw($)
}

function startBridge($: Engine) {
  stopBridge()
  st.status = 'starting'
  st.error = undefined
  st.notice = undefined
  void runBridge($, st.gen)
}

async function fill($: Engine, text: string) {
  const filled = await $.prompt.fill({ text, mode: 'replace' }).catch(() => null)
  st.notice = filled?.isFilled ? undefined : `The prompt box did not take the text${filled?.refusal ? ` (${filled.refusal})` : ''}.`
  redraw($)
}

function view(): PaneView {
  const kinds = st.pick ? kindsOf(st.pick) : []
  const groups: PaneView['groups'] = []
  for (const recipe of rank(st.recipes, st.pick)) {
    let group = groups.find(g => g.category === recipe.category)
    if (!group) groups.push((group = { category: recipe.category, items: [] }))
    group.items.push({ recipe, isMatch: score(recipe, kinds) > 0 })
  }
  return {
    status: st.status,
    ...(st.error ? { error: st.error } : {}),
    ...(st.status === 'ready' ? { scriptTag: scriptTag() } : {}),
    ...(st.hello ? { hello: st.hello } : {}),
    ...(st.pick ? { pick: st.pick } : {}),
    groups,
    bad: st.bad,
    ...(st.notice ? { notice: st.notice } : {}),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'restyle', description: 'Open the restyle pane and start the picker bridge; `/restyle off` stops both', argumentHint: 'off' })
    return next(e)
  })

  on('command.run', { command: 'restyle' }, async ($, e) => {
    if (e.args.trim() === 'off') {
      stopBridge()
      await $.ui.close({ id: PANE }).catch(() => {})
      return { text: 'restyle: pane closed, bridge stopped.' }
    }
    await loadRecipes($)
    if (!st.stream) startBridge($)
    const opened = await $.ui.open({ id: PANE, title: 'Restyle' })
    redraw($)
    return { text: opened.isPlaced ? 'restyle: pane open.' : `restyle: the pane waits (${opened.reason}).` }
  })

  // The person's close mark ends the bridge too; an unload ends it with the module.
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) stopBridge()
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    return drawPane({ Box, Text, Button }, view(), {
      install: () => void fill($, installPrompt()),
      restart: () => {
        startBridge($)
        redraw($)
      },
      choose: id => () => {
        const recipe = st.recipes.find(r => `${r.category}/${r.slug}` === id)
        if (st.pick && recipe) void fill($, compose(st.pick, recipe))
      },
    })
  })
}
