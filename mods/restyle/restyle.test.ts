// Behaviour test: /restyle, the pane and the prompt fill, on a faked bridge and a faked recipes folder.
// Run with `claude plugin test restyle` from the repository root.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const RECIPE = [
  '---',
  'name: Scale to 0.97 on press',
  'category: motion',
  'applies_to: button',
  'source: owner',
  'added: 2026-11-18',
  '---',
  '',
  '## When',
  '',
  'A button is pressed.',
  '',
  '## Values',
  '',
  '- Pressed scale: 0.97.',
  '',
  '## Reference',
  '',
  '```css',
  '.button:active { scale: 0.97 }',
  '```',
  '',
  '## Reduced motion',
  '',
  'Keep it.',
  '',
].join('\n')

const PICK = { url: 'http://localhost:3000/', tag: 'button', selector: '#save', text: 'Save', size: { width: 80, height: 32 }, styles: {} }
const READY = { type: 'ready', port: 4321, token: 'tok' }
const out = (line: unknown) => ({ stream: 'stdout' as const, text: `${JSON.stringify(line)}\n` })
const entry = (name: string, kind: 'dir' | 'file') => ({ name, kind, mtimeMs: 1, size: 1, isLink: false })

const isDriver = (s: { argv: readonly string[] }) => s.argv.some(a => a.endsWith('/bridge/audit-url.mjs'))

// The world beneath the mod: one recipe on disk, a bridge that prints `lines` (and each later `say`) and then stays
// up, and a driver that prints `driver` and exits.
const world = (on: On, lines: unknown[], driver: unknown[] = []) => {
  const filled: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  const spawned: { argv: readonly string[]; env?: Record<string, string> }[] = []
  const feed = [...lines]
  let live = 0
  let letGo = () => {}
  mock.store(on)
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('fs.list', async ($, e) => {
    if (e.path.endsWith('/recipes')) return { value: [entry('motion', 'dir')] }
    if (e.path.endsWith('/recipes/motion')) return { value: [entry('scale-to-0-97-on-press.md', 'file'), entry('broken.md', 'file')] }
    throw new Error('ENOENT')
  })
  on('fs.read', async ($, e) => ({ value: e.path.endsWith('broken.md') ? 'not a recipe' : RECIPE }))
  on('process.spawn', async function* ($, e) {
    spawned.push({ argv: e.argv, env: e.env })
    if (isDriver(e)) {
      for (const line of driver) yield out(line)
      return { value: { code: 0, signal: null } }
    }
    live += 1
    try {
      let sent = 0
      // The bridge runs until the mod ends the stream. A generator can only be ended while it waits at a
      // yield, so the test lets the idle bridge go (`letGo`): it then reaches a yield, where the end applies.
      for (;;) {
        while (sent < feed.length) yield out(feed[sent++])
        await new Promise<void>(r => (letGo = r))
        if (sent >= feed.length) yield { stream: 'stderr' as const, text: '.' }
      }
    } finally {
      live -= 1
    }
    return { code: 0, signal: null }
  })
  on('ui.open', async ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', async ($, e) => (closed.push(e.id), { value: undefined }))
  on('prompt.fill', async ($, e) => (filled.push(e.text), { isFilled: true }))
  // One more line on the bridge's stdout, for example a verdict that the board posted.
  const say = (line: unknown) => {
    feed.push(line)
    letGo()
  }
  return { filled, opened, closed, spawned, say, isLive: () => live > 0, letGo: () => letGo() }
}

const PANE = { title: 'Restyle', isFocused: false, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

const run = ($: Engine, args = '') =>
  $.command.run({ command: 'restyle', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

// The bridge loop is not awaited by the command: give it turns to read its lines.
const settle = async (until: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 100 && !(await until()); i++) await new Promise(r => setTimeout(r, 5))
}

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine) => $.ui.mount({ plugin: 'restyle', surface, component: 'Pane', requestId: 'restyle', props: PANE })

  test(`/restyle opens the pane and starts the bridge (${surface})`, async ($, on) => {
    const w = world(on, [READY])
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const result = await run($)
    expect(result.text).toBe('restyle: pane open.')
    expect(w.opened).toEqual(['restyle'])
    expect(w.spawned).toHaveLength(1)
    expect(w.spawned[0]!.argv.at(-1)!.endsWith('/bridge/bridge.mjs')).toBe(true)
    await run($, 'off')
  })

  test(`before a pick, the pane shows the script tag and asks Claude to add it (${surface})`, async ($, on) => {
    const w = world(on, [READY])
    await run($)
    const ui = await mount($)
    await settle(async () => (await ui.findAll({ type: 'Button' })).some(b => b.key === 'install-btn'))
    expect(await ui.find({ text: '<script src="http://127.0.0.1:4321/picker.js?t=tok"></script>' })).toBeDefined()
    await ui.press({ key: 'install-btn' })
    await settle(() => w.filled.length > 0)
    expect(w.filled[0]).toContain('http://127.0.0.1:4321/picker.js?t=tok')
    expect(w.filled[0]).toContain('development-only')
    await run($, 'off')
  })

  test(`a pick lists the recipes; a press fills the prompt and sends nothing (${surface})`, async ($, on) => {
    const w = world(on, [READY, { type: 'hello', url: PICK.url }, { type: 'pick', pick: PICK }])
    await run($)
    const ui = await mount($)
    const key = 'r:motion/scale-to-0-97-on-press'
    await settle(async () => (await ui.findAll({ type: 'Button' })).some(b => b.key === key))
    const button = (await ui.findAll({ type: 'Button' })).find(b => b.key === key)
    expect(button?.props.label).toBe('● Scale to 0.97 on press') // a button recipe matches a <button> pick
    expect(await ui.find({ text: '1 recipe file failed to parse and is left out.' })).toBeDefined()
    await ui.press({ key })
    await settle(() => w.filled.length > 0)
    expect(w.filled).toHaveLength(1)
    expect(w.filled[0]).toContain('#save')
    expect(w.filled[0]).toContain('Scale to 0.97 on press')
    expect(w.filled[0]).toContain('<page-data>')
    await run($, 'off')
  })

  test(`an audit lists its findings; a press fills the fix and makes the element the pick (${surface})`, async ($, on) => {
    const launch = { ...PICK, selector: '#launch', text: '🚀 Launch' }
    const findings = [
      { rule: 'bounce', detail: 'The easing curve overshoots.', pick: launch },
      { rule: 'buzzword', detail: 'The copy uses the word "Unlock".', pick: { ...PICK, tag: 'p', selector: '#lead', text: 'Unlock more' } },
      { rule: 'constructor', detail: 'not a sign', pick: PICK },
      { rule: 'small-target', detail: 'The control is 86 by 32 px.', pick: { ...PICK, tag: 'a', selector: '#tickets', text: '50 tickets' } },
    ]
    const w = world(on, [READY, { type: 'hello', url: PICK.url }, { type: 'audit', url: PICK.url, findings }])
    await run($)
    const ui = await mount($)
    await settle(async () => (await ui.findAll({ type: 'Button' })).some(b => b.key === 'f:0'))
    const buttons = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('f:'))
    expect(buttons.map(b => b.props.label)).toEqual(['Bounce easing · <button> “🚀 Launch”', 'Buzzword copy · <p> “Unlock more”', 'Small hit area · <a> “50 tickets”'])
    expect(await ui.find({ text: 'Audit: 3 findings. Press one to fill the fix.' })).toBeDefined()
    expect(await ui.find({ text: 'Signs of generic UI' })).toBeDefined()
    expect(await ui.find({ text: 'Craft checks' })).toBeDefined()
    await ui.press({ key: 'f:1' })
    await settle(() => w.filled.length > 0)
    expect(w.filled).toHaveLength(1)
    expect(w.filled[0]).toContain('#lead')
    expect(w.filled[0]).toContain('Buzzword copy. Use plain words that say what the product does.')
    expect(w.filled[0]).toContain('finding: "The copy uses the word \\"Unlock\\"."')
    expect(w.filled[0]).not.toContain('Apply the recipe')
    // The finding's element is now the pick: a recipe press targets it.
    await ui.press({ key: 'r:motion/scale-to-0-97-on-press' })
    await settle(() => w.filled.length > 1)
    expect(w.filled[1]).toContain('#lead')
    await run($, 'off')
  })

  // Many steps, each with a redraw: more than the 5 s that a test gets when it names no time.
  test(`/restyle audit <url> runs the driver; the pane counts the cards, takes the board's verdicts and remembers a dismissal (${surface})`, { timeoutMs: 30000 }, async ($, on) => {
    const small = { rule: 'small-target', detail: 'The control is 86 by 32 px.', pick: { ...PICK, tag: 'a', selector: '#tickets', text: '50 tickets' } }
    const press = { rule: 'no-press', detail: 'No :active rule in the stylesheets matches this button.', pick: PICK }
    const cards = [
      { id: 'c1', page: 'https://example.com/', widths: [1440, 390], finding: small },
      { id: 'c2', page: 'https://example.com/login', widths: [390], finding: press },
      { id: 'c3', page: 'https://example.com/', widths: [390], finding: { rule: 'constructor', detail: 'not a sign', pick: PICK } },
    ]
    const w = world(on, [{ ...READY, board: '/tmp/restyle-4321/board.json' }], [{ type: 'progress', text: 'Page 1 of at most 2, 1440 px: https://example.com/' }, { type: 'board', cards }])
    const drivers = () => w.spawned.filter(isDriver)

    expect((await run($, 'audit ftp://example.com/')).text).toBe('restyle: give an http or https URL: /restyle audit <url> [pages]')
    expect((await run($, 'audit')).text).toBe('restyle: give an http or https URL: /restyle audit <url> [pages]')
    expect(w.spawned).toHaveLength(0)

    const result = await run($, 'audit https://example.com/ 2')
    expect(result.text).toBe('restyle: pane open; the audit of https://example.com/ runs. The pane shows the link to the board when it is ready.')
    const ui = await mount($)
    const shows = (text: string) => settle(async () => (await ui.find({ text })) !== undefined)
    await shows('2 cards: 2 wait · 0 accepted · 0 dismissed')
    expect(await ui.find({ text: '2 cards: 2 wait · 0 accepted · 0 dismissed' })).toBeDefined() // the card with no sign is left out
    expect(drivers()).toHaveLength(1)
    expect(drivers()[0]!.argv.slice(2)).toEqual(['https://example.com/', '--pages', '2', '--out', '/tmp/restyle-4321/board.json'])
    expect(drivers()[0]!.env).toEqual({ RESTYLE_DISMISSED: '{}' })
    const links = await ui.findAll({ type: 'Link' })
    expect(links.map(l => l.props.href)).toEqual(['http://localhost:4321/board?t=tok']) // `localhost`: the desktop surface makes no link of 127.0.0.1

    // The board posts verdicts; the bridge prints them. An accept fills the fix and sends nothing.
    w.say({ type: 'verdict', id: 'c1', verdict: 'accept', reason: '', comment: 'Keep the "look" of the link.', at: '2026-11-24T10:00:00.000Z' })
    await settle(() => w.filled.length > 0)
    expect(w.filled[0]).toContain('#tickets')
    expect(w.filled[0]).toContain('This element fails a craft check: Small hit area.')
    expect(w.filled[0]).toContain(`with this comment about the element: "Keep the 'look' of the link."`)
    w.say({ type: 'verdict', id: 'c2', verdict: 'dismiss', reason: 'A script gives the press feedback.', comment: '', at: '2026-11-24T10:01:00.000Z' })
    w.say({ type: 'verdict', id: 'c9', verdict: 'accept', reason: '', comment: '', at: '2026-11-24T10:02:00.000Z' }) // not a card of this board
    await shows('2 cards: 0 wait · 1 accepted · 1 dismissed')
    expect(await ui.find({ text: '2 cards: 0 wait · 1 accepted · 1 dismissed' })).toBeDefined()
    expect(w.filled).toHaveLength(1) // a dismiss fills nothing; a verdict for an unknown card does nothing

    // The accepted card stays in the pane: a press fills its fix again.
    const accepted = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('b:'))
    expect(accepted.map(b => b.props.label)).toEqual(['Fill the fix: Small hit area · <a> “50 tickets”'])
    await ui.press({ key: 'b:c1' })
    await settle(() => w.filled.length > 1)
    expect(w.filled[1]).toBe(w.filled[0])

    // The dismissal is remembered for the origin: the page's own audit leaves the finding out …
    w.say({ type: 'hello', url: 'https://example.com/login' })
    w.say({ type: 'audit', url: 'https://example.com/login', findings: [press, { rule: 'bounce', detail: 'The easing curve overshoots.', pick: { ...PICK, selector: '#launch' } }] })
    await settle(async () => (await ui.findAll({ type: 'Button' })).some(b => b.key === 'f:0'))
    expect((await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('f:')).map(b => b.props.label)).toEqual(['Bounce easing · <button> “Save”'])
    // … and the next audit of a URL gives the driver the dismissed pair for that origin.
    await run($, 'audit https://example.com/pricing')
    await settle(() => drivers().length === 2)
    expect(drivers()[1]!.argv.slice(2)).toEqual(['https://example.com/pricing', '--out', '/tmp/restyle-4321/board.json'])
    expect(JSON.parse(drivers()[1]!.env!.RESTYLE_DISMISSED!)).toEqual({ 'https://example.com': [{ rule: 'no-press', selector: '#save' }] })
    await run($, 'off')
  })

  test(`an accept with recipes picked on the board fills one prompt that carries them, and sends nothing (${surface})`, { timeoutMs: 20000 }, async ($, on) => {
    const press = { rule: 'no-press', detail: 'No :active rule in the stylesheets matches this button.', pick: PICK }
    const cards = [{ id: 'c1', page: 'https://example.com/login', widths: [1440], finding: press }]
    const w = world(on, [{ ...READY, board: '/tmp/restyle-4321/board.json' }], [{ type: 'board', cards }])
    await run($, 'audit https://example.com/login')
    const ui = await mount($)
    await settle(async () => (await ui.find({ text: '1 card: 1 wait · 0 accepted · 0 dismissed' })) !== undefined)
    // The reviewer put recipes on the copy of the button and accepted. An id that is not in the catalog is left out.
    w.say({ type: 'verdict', id: 'c1', verdict: 'accept', reason: '', comment: '', at: '2026-11-24T10:00:00.000Z', picks: ['motion/scale-to-0-97-on-press', 'visual/not-in-the-catalog', '../outside'] })
    await settle(() => w.filled.length > 0)
    expect(w.filled).toHaveLength(1)
    expect(w.filled[0]).toContain('found by the selector `#save`')
    expect(w.filled[0]).toContain('This element fails a craft check: No press feedback.')
    expect(w.filled[0]).toContain('The reviewer tried this recipe on a copy of this element on the board and accepted the result. Apply it to this element:')
    expect(w.filled[0]).toContain('Recipe 1 of 1: "Scale to 0.97 on press" (motion)')
    expect(w.filled[0]).toContain('.button:active { scale: 0.97 }')
    expect(w.filled[0]).not.toContain('Apply the recipe "')
    // The accepted card keeps its picks: a press in the pane fills the same prompt again.
    await settle(async () => (await ui.findAll({ type: 'Button' })).some(b => b.key === 'b:c1'))
    await ui.press({ key: 'b:c1' })
    await settle(() => w.filled.length > 1)
    expect(w.filled[1]).toBe(w.filled[0])
    await run($, 'off')
  })

  test(`an audit that fails says why in the pane (${surface})`, async ($, on) => {
    const w = world(on, [READY], [{ type: 'error', text: 'No Chrome or Chromium found. Set CHROME_PATH.' }])
    await run($, 'audit http://localhost:3000/')
    const ui = await mount($)
    await settle(async () => (await ui.find({ text: 'The audit failed: No Chrome or Chromium found. Set CHROME_PATH.' })) !== undefined)
    expect(await ui.find({ text: 'The audit failed: No Chrome or Chromium found. Set CHROME_PATH.' })).toBeDefined()
    expect(w.spawned.filter(isDriver)[0]!.argv.slice(2)).toEqual(['http://localhost:3000/']) // a bridge that names no board file: the driver takes its own
    expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
    await run($, 'off')
  })

  test(`/restyle off closes the pane and ends the bridge; the next start asks for the same port (${surface})`, async ($, on) => {
    const w = world(on, [READY])
    await run($)
    await settle(() => w.isLive())
    await new Promise(r => setTimeout(r, 50)) // the mod saves the port and token after the ready line, not awaited
    const off = await run($, 'off')
    expect(off.text).toBe('restyle: pane closed, bridge stopped.')
    expect(w.closed).toEqual(['restyle'])
    w.letGo()
    await settle(() => !w.isLive())
    expect(w.isLive()).toBe(false)
    await run($)
    await settle(() => w.spawned.length === 2)
    expect(w.spawned[1]!.env).toEqual({ RESTYLE_PORT: '4321', RESTYLE_TOKEN: 'tok' })
    await run($, 'off')
  })
}
