// Tests for audit-url.mjs (the driver). Two parts:
// 1. The patch table, the crop, the links. Always runs.
// 2. A small site served from a temp folder, in a headless Chrome already on the machine. Skips when none is found
//    or it cannot start. The site sends a strict content security policy: the driver must work under it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { SIGNS } from '../hooks/audit.ts'
import { PATCHES, auditUrl, changes, clipFor, findChrome, linksFrom, pageOf, patchFor, writeBoard } from './audit-url.mjs'

const finding = (rule, detail, pick = {}) => ({ rule, detail, pick: { tag: 'a', selector: '#x', text: '', size: { width: 86, height: 32 }, styles: { display: 'block' }, ...pick } })

// ---------- 1. pure parts ----------

test('each patch is for a rule in SIGNS; patchFor reads own keys only', () => {
  for (const rule of Object.keys(PATCHES)) assert.ok(Object.hasOwn(SIGNS, rule), rule)
  assert.equal(patchFor(finding('no-press', '')), null)
  assert.equal(patchFor(finding('buzzword', '')), null)
  assert.equal(patchFor(finding('constructor', '')), null)
  assert.equal(patchFor(finding('__proto__', '')), null)
})

test('many-radii: the patch is the most used radius in the detail of the picker', () => {
  assert.deepEqual(patchFor(finding('many-radii', 'The page uses these corner radii: 12px ×5, 10px ×2, 14px ×1.')), { 'border-radius': '12px' })
  assert.deepEqual(patchFor(finding('many-radii', 'The page uses these corner radii: 7.5px ×2, 10px ×1, 14px ×1.')), { 'border-radius': '7.5px' })
  // A detail that is not the picker's gives no patch: the value goes into the page as CSS.
  assert.equal(patchFor(finding('many-radii', 'corner radii: red;} body{display:none ×9')), null)
  assert.equal(patchFor(finding('many-radii', '')), null)
})

test('small-target: the patch raises each side that is under 40 px', () => {
  assert.deepEqual(patchFor(finding('small-target', '')), { 'min-height': '40px', 'box-sizing': 'border-box' })
  assert.deepEqual(patchFor(finding('small-target', '', { size: { width: 30, height: 30 } })), { 'min-width': '40px', 'min-height': '40px', 'box-sizing': 'border-box' })
  assert.deepEqual(patchFor(finding('small-target', '', { size: { width: 30, height: 44 }, styles: { display: 'inline' } })), {
    'min-width': '40px', display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', 'box-sizing': 'border-box',
  })
  assert.equal(patchFor(finding('small-target', '', { size: { width: 40, height: 40 } })), null)
})

test('heading-wrap: the patch balances the lines', () => {
  assert.deepEqual(patchFor(finding('heading-wrap', '')), { 'text-wrap': 'balance' })
})

test('clipFor: pads the element, stays inside the page, keeps under the size limit', () => {
  const page = { pageWidth: 1440, pageHeight: 3000 }
  assert.deepEqual(clipFor({ x: 100, y: 200, width: 86, height: 32, ...page }), { x: 76, y: 176, width: 134, height: 80 })
  assert.deepEqual(clipFor({ x: 10.4, y: 0, width: 86, height: 32, ...page }), { x: 0, y: 0, width: 121, height: 56 })
  assert.deepEqual(clipFor({ x: 1380, y: 2980, width: 60, height: 20, ...page }), { x: 1356, y: 2956, width: 84, height: 44 })
  assert.deepEqual(clipFor({ x: 0, y: 0, width: 1440, height: 3000, ...page }), { x: 0, y: 0, width: 1440, height: 900 })
  assert.equal(clipFor({ x: 10, y: 10, width: 0, height: 20, ...page }), null)
})

test('changes: the size and each value that differs', () => {
  const before = { width: 86.2, height: 32, values: { 'min-height': 'auto', 'box-sizing': 'border-box', 'border-radius': '' } }
  const after = { width: 86.2, height: 40, values: { 'min-height': '40px', 'box-sizing': 'border-box', 'border-radius': '12px' } }
  assert.deepEqual(changes(before, after), ['size: 86 by 32 px → 86 by 40 px', 'min-height: auto → 40px', 'border-radius: none → 12px'])
  assert.deepEqual(changes(before, before), [])
})

test('pageOf and linksFrom: same origin, no fragment, not seen, not a sign-out link, not a file', () => {
  assert.equal(pageOf('https://example.com/a#part'), 'https://example.com/a')
  assert.equal(pageOf('javascript:alert(1)'), '')
  assert.equal(pageOf('file:///etc/hosts'), '')
  assert.equal(pageOf('not a url'), '')
  const seen = new Set(['https://example.com/'])
  const hrefs = [
    'https://example.com/', 'https://example.com/#top', 'https://example.com/a', 'https://example.com/a#x', 'https://other.example/a',
    'http://example.com/a', 'https://example.com/logout', 'https://example.com/auth/sign-out', 'https://example.com/report.pdf', 'mailto:a@example.com', 5, null,
    'https://example.com/b?tab=2',
  ]
  assert.deepEqual(linksFrom(hrefs, 'https://example.com', seen), ['https://example.com/a', 'https://example.com/b?tab=2'])
})

test('writeBoard: makes the folder and writes the file whole', () => {
  const dir = mkdtempSync(join(tmpdir(), 'restyle-board-test-'))
  try {
    const file = join(dir, 'deep', 'board.json')
    writeBoard(file, { version: 1, cards: [] })
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, cards: [] })
    assert.equal(existsSync(`${file}.tmp`), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('auditUrl: refuses an address that is not http or https', async () => {
  await assert.rejects(auditUrl(['file:///etc/hosts']), { code: 'BAD_URL' })
})

// ---------- 2. headless Chrome ----------

const CSS = `
body { font-family: sans-serif; margin: 24px; max-width: 420px; }
.navlink { display: inline-block; height: 32px; line-height: 32px; padding: 0 12px; }
h1 { font-size: 32px; line-height: 1.2; }
.box { width: 200px; height: 60px; border: 1px solid #888; margin: 8px 0; }
.a { border-radius: 12px; }
.b { border-radius: 10px; }
.c { border-radius: 14px; }
#go { height: 48px; padding: 0 24px; }
#q { box-sizing: border-box; width: 160px; height: 30px; padding: 0 8px; border: 0 solid #888; }
`
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site</title><link rel="stylesheet" href="/site.css"></head><body>${body}</body></html>`
const SITE = {
  // A 32 px high link, three corner radii, a heading that wraps, a button with no press rule.
  'index.html': page(
    '<nav><a id="small" class="navlink" href="/two.html">Two</a> <a href="https://example.com/away">Away</a> <a href="/signout">Sign out</a> <a href="/two.html#part">Two again</a></nav>' +
      '<h1 id="title">A heading that is long enough to run over two lines in this narrow column of the page</h1>' +
      '<div class="box a">one</div><div class="box a">two</div><div class="box a">three</div><div class="box b">four</div><div class="box b">five</div><div class="box c" id="odd">six</div>' +
      '<button id="go" type="button">Go to the next step</button>',
  ),
  'two.html': page('<h1>Two</h1><p>The second page. <a href="/">Back</a> <a href="/three.html">Three</a></p><button id="tiny" type="button">x</button><input id="q" type="text" placeholder="Search">'),
  'three.html': page('<h1>Three</h1>'),
  'site.css': CSS,
}

test('headless Chrome: two pages at two widths, real before and after crops, a dismissed finding left out', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome or Chromium found; set CHROME_PATH to run this part')

  const dir = mkdtempSync(join(tmpdir(), 'restyle-site-'))
  for (const [name, text] of Object.entries(SITE)) writeFileSync(join(dir, name), text)
  const asked = []
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname
    asked.push(`${req.method} ${path}`)
    const file = join(dir, path === '/' ? 'index.html' : path.slice(1))
    if (path.includes('..') || !existsSync(file)) return res.writeHead(404).end()
    res.writeHead(200, {
      'content-type': extname(file) === '.css' ? 'text/css' : 'text/html; charset=utf-8',
      // The policy of an app that refuses the picker's script tag.
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'",
    })
    res.end(readFileSync(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    const notes = []
    let board
    try {
      board = await auditUrl([`${origin}/`], { pages: 2, settleMs: 100, chrome, onProgress: (text) => notes.push(text) })
    } catch (err) {
      if (err.code === 'CHROME_START') return t.skip(err.message)
      throw err
    }

    assert.equal(board.version, 1)
    assert.equal(board.origin, origin)
    assert.deepEqual(board.pages, [`${origin}/`, `${origin}/two.html`], 'the page limit is 2: three.html is not read')
    assert.deepEqual(board.widths, [1440, 390])
    assert.equal(notes.length, 4, 'one progress line for each page at each width')
    assert.ok(asked.every((a) => a.startsWith('GET ')), 'the driver only reads')
    for (const never of ['/signout', '/three.html']) assert.equal(asked.some((a) => a.endsWith(never)), false, never)

    const IMAGE = /^data:image\/webp;base64,[A-Za-z0-9+/=]{200,}$/
    const card = (rule, selector) => board.cards.find((c) => c.rule === rule && c.pick.selector === selector)
    assert.deepEqual(board.cards.map((c) => c.id), board.cards.map((_, i) => `c${i + 1}`))

    // The same finding at both widths is one card.
    const small = card('small-target', '#small')
    assert.ok(small, 'small-target on the nav link')
    assert.deepEqual(small.widths, [1440, 390])
    assert.equal(small.page, `${origin}/`)
    assert.equal(small.name, 'Small hit area')
    assert.equal(small.tier, 'craft')
    assert.equal(small.fix, SIGNS['small-target'].fix)
    assert.match(small.before, IMAGE)
    assert.match(small.after, IMAGE)
    assert.notEqual(small.after, small.before, 'the after crop shows the patch')
    assert.ok(small.changed.some((c) => /^size: \d+ by 32 px → \d+ by 40 px$/.test(c)), small.changed.join(' | '))

    const radii = card('many-radii', '#odd')
    assert.ok(radii, 'many-radii on the box with the least used radius')
    assert.match(radii.detail, /12px ×3, 10px ×2, 14px ×1/)
    assert.deepEqual(radii.changed, ['border-radius: 14px → 12px'])
    assert.match(radii.after, IMAGE)
    assert.notEqual(radii.after, radii.before)

    const heading = card('heading-wrap', '#title')
    assert.ok(heading, 'heading-wrap on the long heading')
    assert.match(heading.before, IMAGE)
    assert.ok(heading.after ? heading.changed.some((c) => c.includes('balance')) : heading.changed.includes('The patch changes nothing that shows at this width.'))

    // No CSS patch can show press feedback: the before crop and the fix text only.
    const press = card('no-press', '#go')
    assert.ok(press, 'no-press on the button')
    assert.match(press.before, IMAGE)
    assert.equal(press.after, undefined)
    assert.deepEqual(press.changed, [])

    // The live copy of that button: its own tag and text, its real computed values, nothing of the page's own markup.
    const copy = press.capsule
    assert.ok(copy, press.noCapsule)
    assert.equal(copy.html, '<button data-r="0" data-restyle-root type="button">Go to the next step</button>')
    assert.match(copy.css, /^\[data-r="0"\]\{[^{}]*\}$/)
    assert.match(copy.css, /height:48px/)
    assert.match(copy.css, /padding-left:24px/)
    assert.deepEqual([copy.width > 100, copy.height], [true, 48])
    assert.equal(/url\(|<|127\.0\.0\.1/.test(copy.css + copy.html.replace(/<\/?button[^>]*>/g, '')), false)
    assert.ok(copy.gaps.length >= 2)
    // The shelf: recipes of the catalog that fit a button and have a patch. The press recipe is one of them.
    assert.ok(press.shelf.includes('motion/scale-to-0-97-on-press'), press.shelf.join(', '))
    assert.ok(press.shelf.length <= 12 && Array.isArray(press.more))
    for (const id of press.shelf) assert.match(board.recipes[id].patch, /&/, id)
    assert.equal(board.recipes['motion/scale-to-0-97-on-press'].name, 'Scale to 0.97 on press')
    // A larger element has a copy with a part for each child.
    // An element that is not a control is a div in the copy: its computed values say how it looks.
    assert.match(heading.capsule.html, /^<div data-r="0" data-restyle-root>A heading that is long enough/)
    assert.match(heading.capsule.css, /font-size:32px/)

    const tiny = card('small-target', '#tiny')
    assert.equal(tiny?.page, `${origin}/two.html`)
    assert.ok(tiny.changed.some((c) => /→ 40 by 40 px$/.test(c)), tiny.changed.join(' | '))

    // Two traps of a copy by computed values, both seen on a real page. The copy's document is in standards mode, where
    // an input is a content box: the page's `border-box` must be stated. And a solid line of 0px must state its width.
    const field = card('small-target', '#q')?.capsule
    assert.ok(field, 'a live copy of the input')
    assert.equal(field.html, '<input data-r="0" data-restyle-root type="text" placeholder="Search">')
    assert.match(field.css, /box-sizing:border-box/)
    assert.match(field.css, /border-top-style:solid;border-top-width:0px/)
    assert.deepEqual([field.width, field.height], [160, 30])

    // A later audit leaves out what a reviewer dismissed for this origin, by rule and selector.
    const again = await auditUrl([`${origin}/`], {
      pages: 1, settleMs: 100, chrome,
      dismissed: { [origin]: [{ rule: 'small-target', selector: '#small' }], 'https://other.example': [{ rule: 'no-press', selector: '#go' }] },
    })
    assert.deepEqual(again.pages, [`${origin}/`])
    assert.equal(again.cards.some((c) => c.rule === 'small-target' && c.pick.selector === '#small'), false)
    assert.deepEqual(again.cards.map((c) => c.rule).sort(), ['heading-wrap', 'many-radii', 'no-press'])
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
