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

// The world beneath the mod: one recipe on disk, and a bridge that prints `lines` and then stays up.
const world = (on: On, lines: unknown[]) => {
  const filled: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  const spawned: { argv: readonly string[]; env?: Record<string, string> }[] = []
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
    live += 1
    try {
      for (const line of lines) yield out(line)
      // The bridge runs until the mod ends the stream. A generator can only be ended while it waits at a
      // yield, so the test lets the idle bridge go (`letGo`): it then reaches a yield, where the end applies.
      for (;;) {
        await new Promise<void>(r => (letGo = r))
        yield { stream: 'stderr' as const, text: '.' }
      }
    } finally {
      live -= 1
    }
    return { code: 0, signal: null }
  })
  on('ui.open', async ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', async ($, e) => (closed.push(e.id), { value: undefined }))
  on('prompt.fill', async ($, e) => (filled.push(e.text), { isFilled: true }))
  return { filled, opened, closed, spawned, isLive: () => live > 0, letGo: () => letGo() }
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
