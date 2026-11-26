// The capsule: a self-contained copy of one element of an audited page, for the board. The driver reads the element's
// tree and computed styles in the page (`copyInPage`), and `capsuleOf` builds the copy here, in Node.
// The page is untrusted input. Nothing of the page's own markup is kept: `capsuleOf` writes every tag, attribute and
// declaration itself, from short lists. The copy has no script, no event handler, no form, no frame, no image and no
// address of any host. The board shows it in a sandboxed frame with no script permission.

const MAX_NODES = 200
const MAX_HTML = 80000
const MAX_CSS = 240000

// ---------- these two run in a page ----------

// The element's tree: for each element its tag, a few attributes, its size and every computed value.
export function copyInPage(selector, maxNodes) {
  var root = document.querySelector(selector)
  if (!root) return null
  var first = getComputedStyle(root)
  var props = []
  for (var i = 0; i < first.length; i++) props.push(first[i])
  var ATTRS = ['type', 'placeholder', 'disabled', 'checked', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'fill-rule', 'clip-rule', 'width', 'height']
  var count = 0
  function walk(el) {
    var cs = getComputedStyle(el)
    if (el !== root && cs.getPropertyValue('display') === 'none') return undefined
    if (++count > maxNodes) return null
    var style = []
    for (var i = 0; i < props.length; i++) style.push(cs.getPropertyValue(props[i]))
    var attrs = {}
    for (var a = 0; a < ATTRS.length; a++) if (el.hasAttribute(ATTRS[a])) attrs[ATTRS[a]] = String(el.getAttribute(ATTRS[a])).slice(0, 4000)
    var r = el.getBoundingClientRect()
    var node = { tag: el.localName, svg: el.namespaceURI === 'http://www.w3.org/2000/svg', attrs: attrs, style: style, w: r.width, h: r.height, kids: [] }
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) node.kids.push(String(c.nodeValue).slice(0, 2000))
      else if (c.nodeType === 1) {
        var kid = walk(c)
        if (kid === null) return null
        if (kid) node.kids.push(kid)
      }
    }
    return node
  }
  var tree = walk(root)
  if (!tree) return { tooLarge: true }
  // The colour behind the element: the first ancestor that has one.
  var backdrop = ''
  for (var up = root.parentElement; up && !backdrop; up = up.parentElement) {
    var bg = getComputedStyle(up).getPropertyValue('background-color')
    if (bg && bg !== 'transparent' && bg.indexOf('rgba(0, 0, 0, 0)') < 0) backdrop = bg
  }
  return { props: props, tree: tree, backdrop: backdrop }
}

// What the browser gives each tag of the copy with no stylesheet: the copy states only what differs. Run it in a blank page.
export function defaultsInPage(htmlTags, svgTags) {
  var out = {}
  function read(key, el) {
    var cs = getComputedStyle(el)
    var values = {}
    for (var i = 0; i < cs.length; i++) values[cs[i]] = cs.getPropertyValue(cs[i])
    out[key] = values
  }
  for (var h = 0; h < htmlTags.length; h++) {
    var el = document.body.appendChild(document.createElement(htmlTags[h]))
    read(htmlTags[h], el)
    el.remove()
  }
  var NS = 'http://www.w3.org/2000/svg'
  var svg = document.body.appendChild(document.createElementNS(NS, 'svg'))
  read('svg', svg)
  for (var s = 0; s < svgTags.length; s++) read('svg:' + svgTags[s], svg.appendChild(document.createElementNS(NS, svgTags[s])))
  svg.remove()
  return out
}

// ---------- the cleaner ----------

// The tags of the copy. Every other HTML element becomes a `div`: its computed `display` and the rest say how it looks.
export const HTML_TAGS = ['div', 'button', 'a', 'input', 'textarea', 'select', 'option']
export const SVG_TAGS = ['g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']
const DROPPED = new Set(['script', 'style', 'link', 'meta', 'base', 'template', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'title', 'head', 'portal', 'fencedframe'])
// Media: the copy keeps the box and not the picture.
const BOXES = new Set(['img', 'picture', 'video', 'canvas', 'audio'])
const INPUT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'checkbox', 'radio', 'range', 'button'])
const SVG_ATTRS = new Set(['viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'fill-rule', 'clip-rule', 'width', 'height'])

const PROP = /^-?[a-z][a-z0-9-]*$/
// A flow-relative twin of a physical property (`inline-size` for `width`): the physical one is enough.
const TWIN = /(^|-)(inline|block)(-|$)|^border-(start|end)-(start|end)-radius$/
// A value that could close the rule, load something or hide a character.
const UNSAFE_VALUE = /[{}<>;\\@]|url\s*\(|image-set\s*\(|expression\s*\(|\/\/|\/\*/i
const SVG_VALUE = /^[\w\s.,\-+%()#]*$/
const COLOUR = /^(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([\w\s.,%/+-]+\)$/i
// Inherited properties: a child that differs from its parent must say so, even where its value is the tag's default.
const INHERITED = /^(?:color$|font|line-height$|letter-spacing$|word-spacing$|text-(?:align|indent|transform|shadow|rendering|wrap|anchor|underline-offset|size-adjust)|white-space|visibility$|cursor$|list-style|direction$|writing-mode$|fill|stroke|pointer-events$|-webkit-text|-webkit-font|tab-size$|word-break$|overflow-wrap$|hyphens$|quotes$|caret-color$|color-scheme$|border-collapse$|border-spacing|paint-order$|accent-color$)/

// Always stated, even where the value is the tag's default. A computed width of 0px is the default while the line style
// is `none`; a copy that states `solid` and leaves the width out gets the browser's `medium`, 3 px. The size is stated
// too: the default was read in another page, and `auto` there is a number of px.
const ALWAYS = /^(?:border-(?:top|right|bottom|left)-width|outline-width|column-rule-width|width|height)$/

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;')
const GENERIC_FONT = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|emoji|math|fangsong|inherit|initial|-apple-system|blinkmacsystemfont)$/i

/**
 * The copy of an element, or `{ skipped }` with the reason when there is none.
 * @param raw what `copyInPage` returned; page data
 * @param defaults what `defaultsInPage` returned for HTML_TAGS and SVG_TAGS, from a blank page
 * @returns `{ html, css, width, height, backdrop, gaps }`: `gaps` says what the copy does not show
 */
export function capsuleOf(raw, defaults) {
  if (!raw || typeof raw !== 'object') return { skipped: 'The element was not found for a live copy.' }
  if (raw.tooLarge) return { skipped: `The element has more than ${MAX_NODES} parts: too large for a live copy.` }
  const props = Array.isArray(raw.props) ? raw.props : []
  const names = props.map((p) => (typeof p === 'string' && PROP.test(p) && !TWIN.test(p) ? p : ''))
  const rules = []
  let boxes = 0
  let nodes = 0
  const fonts = new Set()

  const valuesOf = (node) => {
    const map = new Map()
    const style = Array.isArray(node.style) ? node.style : []
    for (let i = 0; i < names.length; i++) {
      const v = style[i]
      if (names[i] && typeof v === 'string' && v !== '' && v.length <= 600 && !UNSAFE_VALUE.test(v)) map.set(names[i], v)
    }
    return map
  }

  // `inside`: the interactive tags that hold this node. A button in a button would break the parser's tree.
  function build(node, parentValues, inside, inSvg) {
    if (!node || typeof node !== 'object' || typeof node.tag !== 'string' || ++nodes > MAX_NODES) return ''
    const name = node.tag.toLowerCase()
    const isRoot = parentValues === null
    let tag
    let key
    if (inSvg || (node.svg === true && name === 'svg')) {
      if (name !== 'svg' && !SVG_TAGS.includes(name)) return ''
      if (name === 'svg' && inSvg) return ''
      tag = name
      key = name === 'svg' ? 'svg' : `svg:${name}`
    } else if (DROPPED.has(name)) return ''
    else if (BOXES.has(name)) tag = key = 'div'
    else if ((name === 'button' || name === 'a') && !inside.has(name)) tag = key = name
    else if (name === 'input' || name === 'textarea' || name === 'select' || name === 'option') tag = key = name
    else tag = key = 'div'

    const values = valuesOf(node)
    const def = (Object.hasOwn(defaults, key) ? defaults[key] : defaults.div) || {}
    const decl = []
    for (const [prop, value] of values) {
      if (value !== def[prop] || ALWAYS.test(prop) || (parentValues && INHERITED.test(prop) && parentValues.get(prop) !== value)) decl.push(`${prop}:${value}`)
    }
    const family = values.get('font-family')
    if (family) {
      const firstFont = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
      if (firstFont && !GENERIC_FONT.test(firstFont)) fonts.add(firstFont)
    }
    const id = rules.length
    rules.push('') // keeps the place: the node's rule comes before the rules of its children
    const attrs = [`data-r="${id}"`]
    if (isRoot) {
      attrs.push('data-restyle-root')
      // The copy stands alone: no margin, and no place taken from the page.
      decl.push('margin:0', 'top:auto', 'left:auto', 'right:auto', 'bottom:auto')
      if (/^(?:fixed|absolute|sticky)$/.test(values.get('position') || '')) decl.push('position:relative')
    }
    const given = node.attrs && typeof node.attrs === 'object' ? node.attrs : {}
    const attr = (k) => (typeof given[k] === 'string' ? given[k] : undefined)
    let inner = ''
    if (BOXES.has(name) && !inSvg) {
      boxes++
      decl.push('background-color:rgb(128 128 128 / 0.3)')
    } else if (tag === 'button') attrs.push('type="button"')
    else if (tag === 'input') {
      const type = String(attr('type') || 'text').toLowerCase()
      attrs.push(`type="${INPUT_TYPES.has(type) ? type : type === 'submit' || type === 'reset' ? 'button' : 'text'}"`)
      if (attr('placeholder') !== undefined) attrs.push(`placeholder="${escapeAttr(attr('placeholder').slice(0, 100))}"`)
      if (attr('disabled') !== undefined) attrs.push('disabled')
      if (attr('checked') !== undefined) attrs.push('checked')
    } else if (tag === 'textarea') {
      if (attr('placeholder') !== undefined) attrs.push(`placeholder="${escapeAttr(attr('placeholder').slice(0, 100))}"`)
    } else if (key.startsWith('svg')) {
      for (const k of SVG_ATTRS) {
        const v = attr(k)
        if (v !== undefined && v.length <= 4000 && SVG_VALUE.test(v) && !/url/i.test(v)) attrs.push(`${k}="${escapeAttr(v)}"`)
      }
    }
    rules[id] = `[data-r="${id}"]{${decl.join(';')}}`

    const voidTag = tag === 'input' || (BOXES.has(name) && !inSvg) || tag === 'textarea'
    if (!voidTag) {
      const within = tag === 'button' || tag === 'a' ? new Set([...inside, tag]) : inside
      for (const kid of Array.isArray(node.kids) ? node.kids : []) {
        if (typeof kid === 'string') inner += key.startsWith('svg') ? '' : escapeText(kid.slice(0, 2000))
        else if (tag !== 'option') inner += build(kid, values, within, key.startsWith('svg'))
      }
    }
    return tag === 'input' ? `<input ${attrs.join(' ')}>` : `<${tag} ${attrs.join(' ')}>${inner}</${tag}>`
  }

  const html = build(raw.tree, null, new Set(), false)
  if (!html) return { skipped: 'The element is of a kind that the live copy does not keep.' }
  const css = rules.join('\n')
  if (nodes > MAX_NODES || html.length > MAX_HTML || css.length > MAX_CSS) return { skipped: 'The element is too large for a live copy.' }

  const gaps = ['States that the page gives by its own stylesheet or script (hover, press, focus) are not in the copy.', 'Layers made with ::before and ::after are not in the copy.']
  if (fonts.size) gaps.push(`The copy uses the fonts of this machine. The page asks for: ${[...fonts].slice(0, 4).join(', ')}.`)
  if (boxes) gaps.push(`${boxes} image${boxes === 1 ? ' is' : 's are'} shown as a grey box.`)
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(Math.ceil(v), 4000)) : 1)
  return {
    html,
    css,
    width: num(raw.tree.w),
    height: num(raw.tree.h),
    backdrop: typeof raw.backdrop === 'string' && COLOUR.test(raw.backdrop) ? raw.backdrop : '',
    gaps,
  }
}

export const CAPSULE_NODES = MAX_NODES
