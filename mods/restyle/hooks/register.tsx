import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Card, Decision, Finding, Pick as ElementPick, Recipe, Verdict } from '../types'
import { decide, decisionsOf, keep, originOf, signOf } from './audit.ts'
import { compose, composeFix } from './compose.ts'
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
  findings: undefined as Finding[] | undefined,
  recipes: [] as Recipe[],
  bad: 0,
  notice: undefined as string | undefined,
  stream: undefined as Bridge | undefined,
  // The audit of a URL and its board.
  board: undefined as string | undefined, // the file the bridge serves as the board's data
  ready: Promise.resolve(), // settles when the bridge prints its ready line, or fails
  onReady: () => {},
  auditGen: 0, // bumps on every audit start and stop; a loop of an older driver writes nothing
  audit: undefined as { url: string; status: 'running' | 'done' | 'failed'; note: string } | undefined,
  cards: [] as Card[],
  driver: undefined as Bridge | undefined,
  decisions: {} as Record<string, Decision[]>, // by page origin; saved under `decisions` in the store
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

async function loadDecisions($: Engine) {
  const stored = await $.store.get('decisions').catch(() => undefined)
  const all: Record<string, Decision[]> = {}
  for (const origin of stored && typeof stored === 'object' ? Object.keys(stored) : []) all[origin] = decisionsOf(stored, origin)
  st.decisions = all
}

function stopAudit() {
  st.auditGen += 1
  const driver = st.driver
  st.driver = undefined
  if (driver) void driver.return({ code: null, signal: null }).catch(() => {})
}

function stopBridge() {
  st.gen += 1
  const stream = st.stream
  st.stream = undefined
  st.status = 'stopped'
  st.hello = undefined
  st.findings = undefined
  st.onReady() // an audit that waits for the bridge sees that it stopped
  // Ending the stream is what ends the child (`$.process.spawn`).
  if (stream) void stream.return({ code: null, signal: null }).catch(() => {})
}

const recipeOf = (id: string | undefined) => st.recipes.find(r => `${r.category}/${r.slug}` === id)

// `picks`: the recipes that a reviewer put on the element's copy on the board. They take the place of the sign's own recipe.
const fixOf = (finding: Finding, comment?: string, picks?: readonly string[]) => {
  const sign = signOf(finding.rule)
  const picked = (picks ?? []).map(recipeOf).filter((r): r is Recipe => r !== undefined)
  return sign && composeFix(finding, sign, picked.length ? picked : recipeOf(sign.recipe), comment)
}

// A verdict from the board: keep it as a decision for the page's origin; an accepted card fills its fix.
function onVerdict($: Engine, id: string, verdict: Verdict) {
  const card = st.cards.find(c => c.id === id)
  if (!card) return
  card.verdict = verdict
  const origin = originOf(card.page)
  st.decisions = { ...st.decisions, [origin]: decide(st.decisions[origin] ?? [], { rule: card.finding.rule, selector: card.finding.pick.selector, ...verdict }) }
  void $.store.set('decisions', st.decisions).catch(() => {})
  const text = verdict.verdict === 'accept' ? fixOf(card.finding, verdict.comment, verdict.picks) : undefined
  if (!text) return
  st.pick = card.finding.pick
  void fill($, text)
}

// The driver's life: it audits the URL, writes the board file and prints the cards.
async function runAudit($: Engine, gen: number, url: string, pages: string | undefined) {
  let failure = ''
  try {
    await st.ready
    if (gen !== st.auditGen) return
    if (st.status !== 'ready') throw new Error(st.error ?? 'the bridge is not running')
    // Each origin's dismissed findings: the driver leaves out those of the origin where the page lands.
    const dismissed: Record<string, { rule: string; selector: string }[]> = {}
    for (const [origin, list] of Object.entries(st.decisions)) dismissed[origin] = list.filter(d => d.verdict === 'dismiss').map(d => ({ rule: d.rule, selector: d.selector }))
    const stream = $.process.spawn({
      argv: ['node', `${$.plugin.root}/bridge/audit-url.mjs`, url, ...(pages ? ['--pages', pages] : []), ...(st.board ? ['--out', st.board] : [])],
      env: { RESTYLE_DISMISSED: JSON.stringify(dismissed) },
    })
    st.driver = stream
    let buffer = ''
    for await (const chunk of stream) {
      if (gen !== st.auditGen) break
      if (chunk.stream === 'stderr') {
        failure = (failure + chunk.text).slice(-300)
        continue
      }
      const lines = (buffer + chunk.text).split('\n')
      buffer = lines.pop() ?? ''
      for (const text of lines) {
        const line = parseLine(text)
        if (!st.audit) break
        if (line?.type === 'progress') st.audit.note = line.text
        else if (line?.type === 'error') failure = line.text
        else if (line?.type === 'board') {
          st.cards = line.cards.filter(c => signOf(c.finding.rule))
          st.audit.status = 'done'
        }
      }
      redraw($)
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  if (gen !== st.auditGen) return
  st.driver = undefined
  if (st.audit && st.audit.status !== 'done') {
    st.audit.status = 'failed'
    st.audit.note = failure.trim() || 'the driver stopped with no board'
  }
  redraw($)
}

function startAudit($: Engine, url: string, pages: string | undefined) {
  stopAudit()
  st.audit = { url, status: 'running', note: 'Starting Chrome…' }
  st.cards = []
  void runAudit($, st.auditGen, url, pages)
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
          st.board = line.board
          st.onReady()
          if (!reuse) void $.store.set('bridge', { port: line.port, token: line.token }).catch(() => {})
        } else if (line?.type === 'hello') {
          st.hello = line.url
          st.findings = undefined // a new page load: the old findings are stale
        } else if (line?.type === 'audit') {
          // Not the findings that a reviewer dismissed on a board of this origin.
          st.findings = keep(line.findings.filter(f => signOf(f.rule)), st.decisions[originOf(line.url)] ?? [])
        } else if (line?.type === 'verdict') onVerdict($, line.id, { verdict: line.verdict, reason: line.reason, comment: line.comment, at: line.at, ...(line.picks ? { picks: line.picks } : {}) })
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
  st.onReady()
  redraw($)
}

function startBridge($: Engine) {
  stopBridge()
  st.status = 'starting'
  st.error = undefined
  st.notice = undefined
  st.ready = new Promise<void>(resolve => (st.onReady = resolve))
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
    ...(st.findings ? { findings: st.findings.map(f => ({ name: signOf(f.rule)?.name ?? f.rule, pick: f.pick, isCraft: signOf(f.rule)?.craft === true })) } : {}),
    ...(st.audit
      ? {
          board: {
            ...st.audit,
            // `localhost`, not 127.0.0.1: the desktop surface makes a link of http://localhost and of no other http address.
            ...(st.status === 'ready' ? { href: `http://localhost:${st.port}/board?t=${st.token}` } : {}),
            wait: st.cards.filter(c => !c.verdict).length,
            dismissed: st.cards.filter(c => c.verdict?.verdict === 'dismiss').length,
            accepted: st.cards.filter(c => c.verdict?.verdict === 'accept').map(c => ({ id: c.id, name: signOf(c.finding.rule)?.name ?? c.finding.rule, pick: c.finding.pick })),
          },
        }
      : {}),
    groups,
    bad: st.bad,
    ...(st.notice ? { notice: st.notice } : {}),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'restyle',
      description: 'Open the restyle pane and start the picker bridge; `/restyle audit <url>` audits a URL with no script tag and makes a board; `/restyle off` stops all',
      argumentHint: 'audit <url> [pages] | off',
    })
    return next(e)
  })

  on('command.run', { command: 'restyle' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'off') {
      stopAudit()
      stopBridge()
      await $.ui.close({ id: PANE }).catch(() => {})
      return { text: 'restyle: pane closed, bridge stopped.' }
    }
    const audit = /^audit(?:\s+(\S+))?(?:\s+(\d{1,2}))?$/.exec(args)
    if (audit && !originOf(audit[1] ?? '')) return { text: 'restyle: give an http or https URL: /restyle audit <url> [pages]' }
    await loadRecipes($)
    await loadDecisions($)
    if (!st.stream) startBridge($)
    const opened = await $.ui.open({ id: PANE, title: 'Restyle' })
    if (audit) startAudit($, audit[1]!, audit[2])
    redraw($)
    const pane = opened.isPlaced ? 'pane open' : `the pane waits (${opened.reason})`
    return { text: audit ? `restyle: ${pane}; the audit of ${audit[1]} runs. The pane shows the link to the board when it is ready.` : `restyle: ${pane}.` }
  })

  // The person's close mark ends the bridge too; an unload ends it with the module.
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) {
      stopAudit()
      stopBridge()
    }
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    return drawPane({ Box, Text, Button, Link }, view(), {
      fixCard: id => () => {
        const card = st.cards.find(c => c.id === id)
        const text = card && fixOf(card.finding, card.verdict?.comment, card.verdict?.picks)
        if (!card || !text) return
        st.pick = card.finding.pick
        void fill($, text)
      },
      install: () => void fill($, installPrompt()),
      restart: () => {
        startBridge($)
        redraw($)
      },
      choose: id => () => {
        const recipe = st.recipes.find(r => `${r.category}/${r.slug}` === id)
        if (st.pick && recipe) void fill($, compose(st.pick, recipe))
      },
      fix: index => () => {
        const finding = st.findings?.[index]
        const text = finding && fixOf(finding)
        if (!finding || !text) return
        // The finding's element becomes the pick, so the recipe list ranks for it too.
        st.pick = finding.pick
        void fill($, text)
      },
    })
  })
}
