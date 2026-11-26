// Tests for capsule.mjs: the cleaner that builds the live copy of an element from what a page reports.
// The page is hostile here: every tag, attribute, text and style value is input from it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capsuleOf } from './capsule.mjs'

const PROPS = ['display', 'color', 'font-family', 'width', 'background-image', 'position', 'inline-size', 'cursor']
const DEFAULTS = {
  div: { display: 'block', color: 'rgb(0, 0, 0)', 'font-family': 'Times', width: 'auto', 'background-image': 'none', position: 'static', cursor: 'auto' },
  button: { display: 'inline-block', color: 'rgb(0, 0, 0)', 'font-family': 'system-ui', width: 'auto', 'background-image': 'none', position: 'static', cursor: 'default' },
  a: { display: 'inline', color: 'rgb(0, 0, 238)', 'font-family': 'Times', width: 'auto', 'background-image': 'none', position: 'static', cursor: 'pointer' },
  input: { display: 'inline-block', color: 'rgb(0, 0, 0)', 'font-family': 'system-ui', width: 'auto', 'background-image': 'none', position: 'static', cursor: 'text' },
  svg: { display: 'inline', color: 'rgb(0, 0, 0)', 'font-family': 'Times', width: 'auto', 'background-image': 'none', position: 'static', cursor: 'auto' },
  'svg:path': { display: 'inline', color: 'rgb(0, 0, 0)', 'font-family': 'Times', width: 'auto', 'background-image': 'none', position: 'static', cursor: 'auto' },
}
// A node as the page reports it: values in the order of PROPS.
const node = (tag, style = {}, kids = [], more = {}) => ({ tag, svg: false, attrs: {}, w: 120, h: 36, kids, ...more, style: PROPS.map((p) => style[p] ?? DEFAULTS.div[p] ?? '') })
const raw = (tree, more = {}) => ({ props: PROPS, tree, backdrop: 'rgb(20, 20, 30)', ...more })

test('a button with a label and an icon: its tags, its text, and only the values that differ', () => {
  const icon = node('svg', { display: 'block', width: '16px' }, [node('path', {}, [], { svg: true, attrs: { d: 'M0 0h16v16z', fill: 'currentColor' } })], { svg: true, attrs: { viewBox: '0 0 16 16', width: '16' } })
  const label = node('span', { display: 'inline', color: 'rgb(255, 255, 255)', 'font-family': '"Inter", sans-serif', cursor: 'pointer' }, ['Save & close'])
  const c = capsuleOf(raw(node('button', { display: 'flex', color: 'rgb(255, 255, 255)', 'font-family': '"Inter", sans-serif', width: '120px', cursor: 'pointer' }, [icon, label])), DEFAULTS)
  assert.equal(c.skipped, undefined)
  assert.equal(c.html, '<button data-r="0" data-restyle-root type="button"><svg data-r="1" viewBox="0 0 16 16" width="16"><path data-r="2" d="M0 0h16v16z" fill="currentColor"></path></svg><div data-r="3">Save &amp; close</div></button>')
  const rules = c.css.split('\n')
  assert.equal(rules[0], '[data-r="0"]{display:flex;color:rgb(255, 255, 255);font-family:"Inter", sans-serif;width:120px;cursor:pointer;margin:0;top:auto;left:auto;right:auto;bottom:auto}')
  // The span became a div: `display:inline` differs from a div's default, so the copy says it. The colour is the
  // parent's, but it differs from the default, so the copy says it too.
  assert.equal(rules[3], '[data-r="3"]{display:inline;color:rgb(255, 255, 255);font-family:"Inter", sans-serif;width:auto;cursor:pointer}')
  assert.equal(c.css.includes('inline-size'), false, 'a flow-relative twin is left out')
  assert.deepEqual([c.width, c.height, c.backdrop], [120, 36, 'rgb(20, 20, 30)'])
  assert.ok(c.gaps.some((g) => g.includes('Inter')), 'the copy says which font the page asks for')
})

test('a line width of 0px is stated though it is the default: a solid line with no stated width is 3 px wide', () => {
  const props = ['border-top-style', 'border-top-width', 'outline-style', 'outline-width']
  const defaults = { div: { 'border-top-style': 'none', 'border-top-width': '0px', 'outline-style': 'none', 'outline-width': '0px' } }
  const c = capsuleOf({ props, tree: { tag: 'div', attrs: {}, w: 10, h: 10, kids: [], style: ['solid', '0px', 'none', '0px'] } }, defaults)
  assert.equal(c.css, '[data-r="0"]{border-top-style:solid;border-top-width:0px;outline-width:0px;margin:0;top:auto;left:auto;right:auto;bottom:auto}')
})

test('an inherited value: a child with the default value under a parent with another value states it', () => {
  const child = node('span', { display: 'block' }) // black text, the default, inside a white-text parent
  const c = capsuleOf(raw(node('div', { color: 'rgb(255, 255, 255)' }, [child])), DEFAULTS)
  assert.match(c.css.split('\n')[1], /color:rgb\(0, 0, 0\)/)
})

test('hostile markup: no script, no handler, no address, no frame, no form survives', () => {
  const evil = node('div', { 'background-image': 'url(https://evil.example/x.png)', color: 'red;} body{display:none', 'font-family': 'x</style><script>alert(1)</script>', width: 'expression(alert(1))' }, [
    node('script', {}, ['alert(1)']),
    node('style', {}, ['body{display:none}']),
    node('iframe', {}, [], { attrs: { src: 'https://evil.example/' } }),
    node('object', {}, []),
    node('link', {}, []),
    node('meta', {}, [], { attrs: { 'http-equiv': 'refresh', content: '0;url=https://evil.example/' } }),
    node('base', {}, []),
    node('form', {}, [node('input', {}, [], { attrs: { type: 'hidden', value: 'secret', onfocus: 'alert(1)', formaction: 'https://evil.example/', placeholder: '"><script>alert(1)</script>' } })], { attrs: { action: 'https://evil.example/' } }),
    node('a', {}, ['<i>markup as text</i>'], { attrs: { href: 'javascript:alert(1)', onclick: 'alert(1)', style: 'color:red' } }),
    node('img', {}, [], { attrs: { src: 'https://evil.example/pixel.gif', srcset: 'https://evil.example/2x.gif 2x', onerror: 'alert(1)' } }),
    node('svg', {}, [
      node('script', {}, ['alert(1)'], { svg: true }),
      node('foreignObject', {}, [node('iframe', {}, [])], { svg: true }),
      node('use', {}, [], { svg: true, attrs: { href: 'https://evil.example/a.svg#x' } }),
      node('path', {}, [], { svg: true, attrs: { d: 'M0 0"/><script>alert(1)</script>', fill: 'url(https://evil.example/#p)', onload: 'alert(1)', transform: 'rotate(45 8 8)' } }),
    ], { svg: true, attrs: { onload: 'alert(1)', viewBox: '0 0 16 16' } }),
    node('x-widget" onmouseover="alert(1)', {}, ['custom']),
    { tag: 5 }, null, 'plain <b>text</b> & more',
  ], { attrs: { onclick: 'alert(1)', id: 'x', class: 'y', style: 'background:url(https://evil.example/)' } })
  const c = capsuleOf(raw(evil, { backdrop: 'red;}</style><script>alert(1)</script>' }), DEFAULTS)
  assert.equal(c.skipped, undefined)
  const all = c.html + c.css + c.backdrop
  for (const bad of ['<script', '<style', '<iframe', '<object', '<link', '<meta', '<base', '<form', '<img', '<use', '<foreignObject', 'evil.example', 'javascript:', 'alert(1)\'', 'onclick', 'onerror', 'onload', 'onfocus', 'onmouseover', 'href', 'src', 'action', 'style=', 'secret', 'url(', 'expression', '</style']) {
    assert.equal(all.toLowerCase().includes(bad.toLowerCase()), false, `the copy holds ${bad}`)
  }
  assert.equal(c.backdrop, '')
  // What is left: the link with no address and its text as text, the image as a grey box, the path with its safe attribute, the text.
  assert.match(c.html, /<a data-r="\d+">&lt;i&gt;markup as text&lt;\/i&gt;<\/a>/)
  assert.match(c.html, /<path data-r="\d+" transform="rotate\(45 8 8\)"><\/path>/)
  assert.match(c.html, /<input data-r="\d+" type="text" placeholder="&quot;&gt;&lt;/)
  assert.ok(c.html.includes('plain &lt;b&gt;text&lt;/b&gt; &amp; more'))
  assert.match(c.css, /background-color:rgb\(128 128 128 \/ 0\.3\)/)
  assert.ok(c.gaps.some((g) => g.startsWith('1 image is shown as a grey box')))
  // Each declaration is `name:value` with a value that cannot close the rule.
  for (const rule of c.css.split('\n')) assert.match(rule, /^\[data-r="\d+"\]\{[^{}<>]*\}$/)
})

test('a page that lies about the property names or the values', () => {
  const tree = { tag: 'div', attrs: {}, w: 'wide', h: -5, kids: [], style: ['flex', 'x'.repeat(700), 7, 'red'] }
  const c = capsuleOf({ props: ['display', 'color', 'width', 'color}body{x', '__proto__'], tree, backdrop: 5 }, DEFAULTS)
  assert.equal(c.css, '[data-r="0"]{display:flex;margin:0;top:auto;left:auto;right:auto;bottom:auto}')
  assert.deepEqual([c.width, c.height], [1, 1])
})

test('a button in a button and a link in a link: the inner one is a div, so the parser keeps the tree', () => {
  const c = capsuleOf(raw(node('button', {}, [node('button', {}, ['in']), node('a', {}, [node('a', {}, ['deep'])])])), DEFAULTS)
  assert.equal(c.html, '<button data-r="0" data-restyle-root type="button"><div data-r="1">in</div><a data-r="2"><div data-r="3">deep</div></a></button>')
})

test('an element that is fixed in the page stands in the flow of the copy', () => {
  const c = capsuleOf(raw(node('nav', { position: 'fixed' })), DEFAULTS)
  assert.ok(c.css.endsWith('position:relative}'))
})

test('no copy: nothing found, too many parts, a kind that is not kept', () => {
  assert.match(capsuleOf(null, DEFAULTS).skipped, /not found/)
  assert.match(capsuleOf({ tooLarge: true }, DEFAULTS).skipped, /more than 200 parts/)
  assert.match(capsuleOf(raw(node('script', {}, ['x'])), DEFAULTS).skipped, /does not keep/)
  const many = node('div', {}, Array.from({ length: 250 }, () => node('span', {}, ['x'])))
  assert.match(capsuleOf(raw(many), DEFAULTS).skipped, /too large/)
})
