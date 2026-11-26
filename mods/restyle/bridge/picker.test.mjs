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

// ---------- 1b. audit on a stub with its own styles ----------

class Styled extends El {
  constructor(tag, styles = {}, children = [], rect = { width: 300, height: 60 }) {
    super(tag, {}, children)
    this.styles = styles
    this.rect = rect
  }
  get childElementCount() {
    return this.children.length
  }
  getBoundingClientRect() {
    return { ...this.rect, left: 0, top: 0 }
  }
}

// A styled element with attributes, classes and a `matches` that knows `.class` selector lists.
function mk(tag, { styles = {}, rect, attrs = {}, classes = [], disabled = false } = {}, children = []) {
  const el = new Styled(tag, styles, children, rect)
  Object.assign(el.attrs, attrs)
  el.disabled = disabled
  el.matches = (sel) => sel.split(',').some((s) => classes.includes(s.trim().slice(1)))
  return el
}

function auditOf(children, styleSheets) {
  const body = new Styled('body', {}, children)
  const html = new El('html', {}, [body])
  const all = (el) => [el, ...el.children.flatMap(all)]
  const ctx = {
    document: {
      body,
      documentElement: html,
      currentScript: null,
      querySelectorAll: (sel) => (sel === 'body *' ? all(body).slice(1) : []),
      ...(styleSheets ? { styleSheets } : {}), // none: the audit cannot read press rules, and skips that check
    },
    location: { href: 'http://localhost:3000/' },
    getComputedStyle: (el) => ({ getPropertyValue: (k) => (el.styles && el.styles[k]) || '' }),
    URL,
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(pickerCode, ctx)
  return JSON.parse(JSON.stringify(ctx.__restyle.audit())) // plain objects of this realm
}

test('stub: audit finds each sign on a generic page', () => {
  const centre = { 'text-align': 'center' }
  const card = () => new Styled('div', { 'border-radius': '24px', 'box-shadow': 'rgba(0, 0, 0, 0.1) 0px 8px 24px' }, ['Card'])
  const glass = () => new Styled('div', { 'backdrop-filter': 'blur(12px)' }, ['Glass'])
  const out = auditOf([
    new Styled('span', { 'border-radius': '9999px' }, ['New'], { width: 60, height: 24 }),
    new Styled('h1', { ...centre, 'background-image': 'linear-gradient(90deg, rgb(124, 58, 237), rgb(59, 130, 246))', '-webkit-background-clip': 'text' }, ['Build faster']),
    new Styled('section', { 'background-image': 'linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(59, 130, 246) 100%)' }, [
      new Styled('p', centre, ['Unlock seamless workflows']),
      new Styled('button', { 'transition-timing-function': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' }, ['🚀 Launch']),
    ]),
    new Styled('p', centre, ['One']),
    new Styled('p', centre, ['Two']),
    new Styled('p', centre, ['Three']),
    new Styled('p', centre, ['Four']),
    card(), card(), card(), card(),
    glass(), glass(), glass(),
  ])
  assert.equal(out.url, 'http://localhost:3000/')
  assert.deepEqual(
    [...new Set(out.findings.map((f) => f.rule))].sort(),
    ['all-centred', 'bounce', 'buzzword', 'emoji-icon', 'glass-blur', 'gradient-text', 'pill-badge', 'purple-gradient', 'same-card'],
  )
  assert.ok(out.findings.length <= 24)
  for (const f of out.findings) {
    assert.equal(typeof f.detail, 'string')
    assertAuditPick(f.pick)
  }
  const by = (rule) => out.findings.find((f) => f.rule === rule)
  assert.equal(by('pill-badge').pick.tag, 'span')
  assert.equal(by('buzzword').detail, 'The copy uses the word "Unlock".')
  assert.equal(by('same-card').detail, '4 surfaces share the radius 24px and the same shadow.')
  assert.equal(by('all-centred').detail, '6 of 6 text blocks are centred.')
  assert.equal(by('glass-blur').detail, 'The surface uses a backdrop blur. 3 on this page.')
})

function assertAuditPick(pick) {
  for (const k of Object.keys(pick)) assert.ok(PICK_KEYS.has(k), `unexpected key ${k}`)
  assert.equal(typeof pick.tag, 'string')
  assert.equal(typeof pick.selector, 'string')
}

test('stub: audit finds nothing on a plain page, and stays under the limits on a big one', () => {
  const plain = auditOf([
    new Styled('h1', {}, ['Settings']),
    new Styled('p', {}, ['Change how the app works.']),
    new Styled('button', { 'transition-timing-function': 'cubic-bezier(0.32, 0.72, 0, 1)', 'border-radius': '8px' }, ['Save']),
    new Styled('div', { 'backdrop-filter': 'blur(8px)' }, ['One blurred layer is fine']),
    new Styled('span', {}, ['© 2026 Example']), // a copyright sign is not an emoji icon
    new Styled('span', {}, ['™ and ® too']),
    Object.assign(new Styled('span', {}, ['🎯']), { getClientRects: () => [] }), // inside a hidden sidebar: not rendered
    new Styled('div', { 'background-image': 'linear-gradient(rgb(250, 250, 250), rgb(240, 240, 240))' }, ['Grey gradient']),
  ])
  assert.deepEqual(plain.findings, [])

  const many = auditOf(Array.from({ length: 200 }, (_, i) => new Styled('p', {}, [`🎉 Unlock ${'x'.repeat(180)} ${i}`])))
  assert.equal(many.findings.length, 4, 'two per rule')
  assert.equal(many.findings[0].detail, 'The copy uses the word "Unlock". 200 on this page.')
})

test('stub: craft checks find a button with no press rule, a small target, many radii and durations, an unbalanced heading', () => {
  const sheets = [
    { cssRules: [{ selectorText: '.btn:active' }, { cssRules: [{ selectorText: '.ghost:active, .ghost:hover' }] }] },
    { get cssRules() { throw new Error('a sheet from another origin') } },
  ]
  const big = { width: 120, height: 44 }
  const edge = (radius) => mk('div', { styles: { 'border-top-width': '1px', 'border-radius': radius } }, ['Box'])
  const out = auditOf([
    mk('h1', { styles: { 'line-height': '32px' }, rect: { width: 300, height: 32 } }, ['One line']),
    mk('h2', { styles: { 'line-height': '32px', 'text-wrap': 'wrap' }, rect: { width: 300, height: 96 } }, ['Three lines of heading text']),
    mk('h2', { styles: { 'line-height': '32px', 'text-wrap': 'balance' }, rect: { width: 300, height: 96 } }, ['Balanced already']),
    Object.assign(mk('h2', { styles: { 'line-height': '32px' }, rect: { width: 300, height: 64 } }, ['Two lines by a line break']), { querySelector: (s) => (s === 'br' ? {} : null) }),
    mk('a', { attrs: { href: '/terms' }, rect: { width: 39.6, height: 44 }, styles: { display: 'inline-flex' } }, ['Terms']), // 39.6 px shows as 40: no finding
    mk('button', { classes: ['btn'], rect: big, styles: { 'transition-duration': '0.12s' } }, ['Save']),
    mk('button', { classes: ['ghost'], rect: big, styles: { 'transition-duration': '0.12s, 0.3s' } }, ['Cancel']),
    mk('button', { rect: big, styles: { 'transition-duration': '0.15s' } }, ['Invite']),
    mk('button', { rect: big, disabled: true }, ['Disabled']),
    mk('div', {}, [mk('a', { attrs: { href: '/tickets' }, rect: { width: 86, height: 32 }, styles: { display: 'inline-flex', 'transition-duration': '0.3s' } }, ['50 tickets'])]),
    mk('p', {}, ['New here? ', mk('a', { attrs: { href: '/signup' }, rect: { width: 107, height: 17 }, styles: { display: 'inline' } }, ['Request access'])]),
    mk('a', { attrs: { href: '#main' }, rect: { width: 1, height: 1 } }, ['Skip to main content']),
    mk('input', { attrs: { type: 'checkbox' }, rect: { width: 16, height: 16 } }),
    edge('10px'), edge('12px'), edge('12px'), edge('14px'),
    mk('div', { styles: { 'border-top-width': '1px', 'border-radius': '9999px' }, rect: { width: 80, height: 28 } }, ['Pill']),
    mk('div', { styles: { 'border-top-width': '1px', 'border-radius': '50%' }, rect: { width: 40, height: 40 } }, ['A']),
    mk('div', { styles: { 'border-radius': '20px' } }, ['No edge: it does not count']),
  ], sheets)
  const got = Object.fromEntries(out.findings.map((f) => [f.rule, f]))
  assert.deepEqual(Object.keys(got).sort(), ['heading-wrap', 'many-durations', 'many-radii', 'no-press', 'small-target'])
  assert.equal(out.findings.length, 5)
  assert.equal(got['no-press'].pick.text, 'Invite')
  assert.equal(got['small-target'].pick.text, '50 tickets')
  assert.equal(got['small-target'].detail, 'The control is 86 by 32 px. A hit area needs 40 by 40 px.')
  assert.equal(got['heading-wrap'].pick.text, 'Three lines of heading text')
  assert.equal(got['many-radii'].detail, 'The page uses these corner radii: 12px ×2, 10px ×1, 14px ×1.')
  assert.equal(got['many-durations'].detail, 'The controls use these transition durations: 120 ms ×2, 150 ms ×1, 300 ms ×1.')

  // Two radii and two durations are a scale, not a finding.
  const two = auditOf([edge('8px'), edge('12px'), mk('button', { classes: ['btn'], rect: big, styles: { 'transition-duration': '0.12s' } }, ['Save']), mk('button', { classes: ['btn'], rect: big, styles: { 'transition-duration': '0.2s' } }, ['Send'])], sheets)
  assert.deepEqual(two.findings, [])
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
    out.audit = R.audit()
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
    // Three signs for the audit, after the fixture's own elements so their selectors stay the same.
    const slop =
      '<div id="slop"><h2 style="background-image:linear-gradient(90deg,#7c3aed,#3b82f6);-webkit-background-clip:text;background-clip:text;color:transparent">Build faster</h2>' +
      '<button type="button" style="transition:transform 300ms cubic-bezier(0.68,-0.55,0.265,1.55)">🚀 Launch</button>' +
      '<div style="display:none"><span>🎯</span></div></div>' + // hidden: the audit must leave it out
      '<style>#save:active { scale: 0.97 }</style>' // the fixture button has press feedback; the slop button has none
    const page = `${fixture.slice(0, end)}${slop}\n${stub}\n${tag}\n${PAGE_CHECK}\n${fixture.slice(end)}`
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

    assert.deepEqual(out.audit.findings.map((f) => `${f.rule} ${f.pick.tag}`).sort(), [
      'bounce button', 'emoji-icon button', 'gradient-text h2',
      'no-press button', // the slop button only: #save has an :active rule
      'small-target button', 'small-target button', // both buttons are under 40 px high
    ])
    assert.equal(out.audit.findings.find((f) => f.rule === 'no-press').pick.text, '🚀 Launch')

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
