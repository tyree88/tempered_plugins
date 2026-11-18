// Tests for picker.js (contract C3). Two parts:
// 1. A hand-made element stub in node:vm. Always runs.
// 2. fixture.html in a headless Chrome already on the machine. Skips when none is found or it cannot start.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const pickerPath = fileURLToPath(new URL('picker.js', import.meta.url))
const fixturePath = fileURLToPath(new URL('fixture.html', import.meta.url))
const pickerCode = readFileSync(pickerPath, 'utf8')

const STYLE_KEYS = [
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'border-radius', 'box-shadow', 'transition',
  'animation-name', 'animation-duration', 'transform', 'display', 'position',
]
const PICK_KEYS = new Set(['url', 'tag', 'selector', 'text', 'role', 'size', 'styles', 'component', 'source'])

function assertPickShape(pick) {
  for (const k of Object.keys(pick)) assert.ok(PICK_KEYS.has(k), `unexpected key ${k}`)
  for (const k of ['url', 'tag', 'selector', 'text']) assert.equal(typeof pick[k], 'string', k)
  assert.ok(pick.text.length <= 200)
  assert.equal(typeof pick.size.width, 'number')
  assert.equal(typeof pick.size.height, 'number')
  assert.deepEqual(Object.keys(pick.styles).sort(), [...STYLE_KEYS].sort())
  for (const v of Object.values(pick.styles)) assert.equal(typeof v, 'string')
}

// ---------- 1. element stub ----------

class El {
  constructor(tag, attrs = {}, children = []) {
    this.nodeType = 1
    this.localName = tag
    this.attrs = attrs
    this.id = attrs.id || ''
    this.parentElement = null
    this.children = []
    this.text = ''
    for (const c of children) {
      if (typeof c === 'string') this.text += c
      else {
        c.parentElement = this
        this.children.push(c)
      }
    }
  }
  get previousElementSibling() {
    const sibs = this.parentElement ? this.parentElement.children : []
    return sibs[sibs.indexOf(this) - 1] || null
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join('')
  }
  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null
  }
  hasAttribute(name) {
    return name in this.attrs
  }
  getBoundingClientRect() {
    return { width: 100.4, height: 32.6, left: 0, top: 0 }
  }
}

function stubPage() {
  const deepest = new El('span', {}, ['deepest'])
  const button = new El('button', { id: 'save' }, ['  Save   changes '])
  const items = [new El('li', {}, ['One']), new El('li', {}, ['Two', new El('span', {}, ['outer ', new El('span', {}, [deepest])])])]
  const main = new El('main', {}, [new El('h1', {}, ['Title']), button, new El('ul', {}, items)])
  const body = new El('body', {}, [main])
  const html = new El('html', {}, [body])
  const all = (el) => [el, ...el.children.flatMap(all)]
  const document = {
    body,
    documentElement: html,
    currentScript: null,
    querySelectorAll(sel) {
      assert.match(sel, /^#[\w-]+$/, 'stub only answers #id queries')
      return all(html).filter((e) => e.id === sel.slice(1))
    },
  }
  const ctx = {
    document,
    location: { href: 'http://localhost:3000/settings' },
    getComputedStyle: () => ({ getPropertyValue: (k) => `v:${k}` }),
    URL,
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(pickerCode, ctx)
  return { R: ctx.__restyle, button, items, deepest, main }
}

test('stub: describe returns the C1 shape with the C3 style keys', () => {
  const { R, button } = stubPage()
  const pick = R.describe(button)
  assertPickShape(pick)
  assert.equal(pick.tag, 'button')
  assert.equal(pick.selector, '#save')
  assert.equal(pick.text, 'Save changes')
  assert.equal(pick.role, 'button')
  assert.deepEqual({ ...pick.size }, { width: 100, height: 33 }) // spread: vm objects have another realm's prototype
  assert.equal(pick.url, 'http://localhost:3000/settings')
  assert.equal(pick.component, undefined)
  assert.equal(pick.source, undefined)
})

test('stub: selectorFor builds nth-of-type steps from body', () => {
  const { R, deepest, items } = stubPage()
  assert.equal(R.selectorFor(items[1]), 'body > main:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(2)')
  assert.equal(
    R.selectorFor(deepest),
    'body > main:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(2) > span:nth-of-type(1) > span:nth-of-type(1) > span:nth-of-type(1)',
  )
})

test('stub: React fiber gives component, and source only when _debugSource exists', () => {
  const { R, items, main } = stubPage()
  function ListItem() {}
  items[0].__reactFiber$abc = { type: 'li', _debugSource: { fileName: 'src/List.tsx', lineNumber: 7 }, return: { type: ListItem } }
  const p18 = R.describe(items[0])
  assert.equal(p18.component, 'ListItem')
  assert.deepEqual({ ...p18.source }, { file: 'src/List.tsx', line: 7 })

  // React 19: no _debugSource; forwardRef wrapper
  main.__reactFiber$abc = { type: 'main', return: { type: { render: function Layout() {} } } }
  const p19 = R.describe(main)
  assert.equal(p19.component, 'Layout')
  assert.equal(p19.source, undefined)

  // a broken fiber must not throw
  items[1].__reactFiber$abc = { get type() { throw new Error('boom') } }
  assert.doesNotThrow(() => R.describe(items[1]))
})

// ---------- 2. headless Chrome ----------

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    if (spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0) return name
  }
  return null
}

const PAGE_CHECK = `
<pre id="result"></pre>
<script>
(function () {
  var out = { errors: [] }
  try {
    var R = window.__restyle
    var sheetsBefore = document.styleSheets.length
    out.roundTrip = Array.prototype.map.call(document.querySelectorAll('body, body *'), function (e) {
      var s = R.selectorFor(e)
      return { s: s, ok: document.querySelector(s) === e }
    })
    var btn = document.getElementById('save')
    out.button = R.describe(btn)
    out.deep = R.describe(document.querySelector('li:nth-of-type(3) span span span'))
    out.heading = R.describe(document.querySelector('h1'))
    out.link = R.describe(document.querySelector('a'))

    var li = document.querySelector('li')
    function ListItem() {}
    li['__reactFiber$test'] = { type: 'li', _debugSource: { fileName: 'src/List.tsx', lineNumber: 7 }, return: { type: ListItem, return: null } }
    out.react18 = R.describe(li)
    var p = document.querySelector('p')
    p['__reactFiber$test'] = { type: 'p', return: { type: { render: function Copy() {} }, return: null } }
    out.react19 = R.describe(p)

    btn.dispatchEvent(new MouseEvent('mousemove', { altKey: true, bubbles: true }))
    var ov = document.querySelector('[data-restyle-overlay]')
    out.overlay = ov && { display: ov.style.display, pointerEvents: getComputedStyle(ov).pointerEvents, position: getComputedStyle(ov).position, parent: ov.parentNode === document.documentElement }
    var ev = new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true })
    btn.dispatchEvent(ev)
    out.altClick = { prevented: ev.defaultPrevented, clicked: window.__clicked || 0 }
    btn.click()
    out.plainClicked = window.__clicked || 0
    out.buttonStyleAttr = btn.getAttribute('style')
    out.sheetsSame = document.styleSheets.length === sheetsBefore
    out.calls = window.__calls
  } catch (e) { out.errors.push(String((e && e.stack) || e)) }
  document.getElementById('result').textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))))
})()
</script>`

test('headless Chrome: fixture round-trips selectors, describe shape, Alt+click', (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome or Chromium found; set CHROME_PATH to run this part')

  const dir = mkdtempSync(join(tmpdir(), 'restyle-picker-'))
  try {
    const stub = `<script>window.__calls = []; window.fetch = function (url, init) { window.__calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body, keepalive: init.keepalive }); return Promise.resolve(new Response(null, { status: 204 })) }</script>`
    const tag = `<script src="${pathToFileURL(pickerPath).href}?t=tok123"></script>`
    const fixture = readFileSync(fixturePath, 'utf8')
    const end = fixture.lastIndexOf('</body>') // the fixture's comment also says </body>
    const page = `${fixture.slice(0, end)}${stub}\n${tag}\n${PAGE_CHECK}\n${fixture.slice(end)}`
    const pagePath = join(dir, 'page.html')
    writeFileSync(pagePath, page)

    const run = spawnSync(chrome, [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--allow-file-access-from-files', `--user-data-dir=${join(dir, 'profile')}`,
      '--dump-dom', pathToFileURL(pagePath).href,
    ], { encoding: 'utf8', timeout: 60000 })
    const m = /<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/.exec(run.stdout || '')
    if (!m) return t.skip(`Chrome did not render the page (status ${run.status}): ${String(run.stderr).trim().split('\n').pop()}`)

    const out = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'))
    assert.deepEqual(out.errors, [])

    const bad = out.roundTrip.filter((r) => !r.ok)
    assert.deepEqual(bad, [], 'every selector finds its element again')
    assert.ok(out.roundTrip.length >= 12)

    assertPickShape(out.button)
    assert.equal(out.button.selector, '#save')
    assert.equal(out.button.tag, 'button')
    assert.equal(out.button.role, 'button')
    assert.equal(out.button.text, 'Save changes')
    assert.equal(out.button.styles['border-radius'], '8px')
    assert.ok(out.button.size.width > 0)
    assert.equal(out.button.component, undefined)

    assertPickShape(out.deep)
    assert.equal(out.deep.selector, 'body > main:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3) > span:nth-of-type(1) > span:nth-of-type(1) > span:nth-of-type(1)')
    assert.equal(out.deep.text, 'deepest')
    assert.equal(out.heading.role, 'heading')
    assert.equal(out.link.role, 'link')

    assert.equal(out.react18.component, 'ListItem')
    assert.deepEqual(out.react18.source, { file: 'src/List.tsx', line: 7 })
    assert.equal(out.react19.component, 'Copy')
    assert.equal(out.react19.source, undefined)

    assert.deepEqual(out.overlay, { display: 'block', pointerEvents: 'none', position: 'fixed', parent: true })
    assert.deepEqual(out.altClick, { prevented: true, clicked: 0 }, 'Alt+click does not reach the page')
    assert.equal(out.plainClicked, 1, 'a plain click still reaches the page')
    assert.equal(out.buttonStyleAttr, null, 'page element styles untouched')
    assert.equal(out.sheetsSame, true)

    const [hello, pick] = out.calls
    assert.equal(out.calls.length, 2)
    assert.match(hello.url, /\/hello\?t=tok123$/)
    assert.equal(JSON.parse(hello.body).url.startsWith('file:'), true)
    assert.match(pick.url, /\/pick\?t=tok123$/)
    for (const c of out.calls) {
      assert.equal(c.method, 'POST')
      assert.deepEqual(c.headers, { 'content-type': 'text/plain' })
      assert.equal(c.keepalive, true)
    }
    const sent = JSON.parse(pick.body)
    assertPickShape(sent)
    assert.equal(sent.selector, '#save')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
