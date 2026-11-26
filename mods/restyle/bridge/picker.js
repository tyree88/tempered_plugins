// restyle picker: Alt+hover outlines an element, Alt+click sends it to the bridge. Contract C3 in the plan.
// It also audits the page for signs of generic machine-made UI and sends the findings.
// Plain browser JavaScript, no build step. It never throws into the host page.
;(function () {
  'use strict'
  try {
    var STYLE_KEYS = [
      'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'color', 'background-color', 'border-radius', 'box-shadow', 'transition',
      'animation-name', 'animation-duration', 'transform', 'display', 'position',
    ]
    var IMPLIED_ROLES = {
      a: 'link', article: 'article', aside: 'complementary', button: 'button', dialog: 'dialog',
      form: 'form', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading',
      h6: 'heading', hr: 'separator', img: 'img', li: 'listitem', main: 'main', menu: 'list',
      nav: 'navigation', ol: 'list', option: 'option', progress: 'progressbar', section: 'region',
      select: 'combobox', summary: 'button', table: 'table', textarea: 'textbox', ul: 'list',
    }
    var INPUT_ROLES = {
      button: 'button', checkbox: 'checkbox', email: 'textbox', image: 'button', number: 'spinbutton',
      radio: 'radio', range: 'slider', reset: 'button', search: 'searchbox', submit: 'button',
      tel: 'textbox', text: 'textbox', url: 'textbox',
    }

    var esc = function (s) {
      return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&')
    }

    function uniqueIdSelector(el) {
      if (!el.id) return ''
      var sel = '#' + esc(el.id)
      try {
        return document.querySelectorAll(sel).length === 1 ? sel : ''
      } catch (e) {
        return ''
      }
    }

    function selectorFor(el) {
      var own = uniqueIdSelector(el)
      if (own) return own
      var steps = []
      var node = el
      while (node && node.nodeType === 1) {
        if (node === document.body || node === document.documentElement) {
          steps.unshift(node.localName)
          break
        }
        var idSel = uniqueIdSelector(node)
        if (idSel) {
          steps.unshift(idSel)
          break
        }
        var n = 1
        for (var sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
          if (sib.localName === node.localName) n++
        }
        steps.unshift(esc(node.localName) + ':nth-of-type(' + n + ')')
        node = node.parentElement
      }
      return steps.join(' > ')
    }

    function roleOf(el) {
      var explicit = el.getAttribute && el.getAttribute('role')
      if (explicit) return explicit.trim().split(/\s+/)[0]
      var tag = el.localName
      if (tag === 'a' && !el.hasAttribute('href')) return undefined
      if (tag === 'input') return INPUT_ROLES[(el.getAttribute('type') || 'text').toLowerCase()]
      if (tag === 'select' && el.multiple) return 'listbox'
      return IMPLIED_ROLES[tag]
    }

    function componentName(t) {
      if (typeof t === 'function') return t.displayName || t.name || ''
      if (t && typeof t === 'object') {
        // forwardRef ({render}) and memo ({type}) wrap the real function
        var inner = t.render || t.type
        return t.displayName || (typeof inner === 'function' ? inner.displayName || inner.name || '' : '')
      }
      return ''
    }

    // shortcut: React 19 dropped _debugSource, so `source` only appears on React 18 dev builds; upgrade if React adds a replacement.
    function reactInfo(el) {
      var out = {}
      try {
        var keys = Object.keys(el)
        var key = null
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf('__reactFiber$') === 0) {
            key = keys[i]
            break
          }
        }
        if (!key) return out
        // host fiber first: its _debugSource is the element's own JSX line, the place to restyle
        for (var f = el[key], guard = 0; f && guard < 1000; f = f.return, guard++) {
          var ds = f._debugSource
          if (!out.source && ds && typeof ds.fileName === 'string' && typeof ds.lineNumber === 'number') {
            out.source = { file: ds.fileName, line: ds.lineNumber }
          }
          var name = typeof f.type === 'string' ? '' : componentName(f.type)
          if (name) {
            out.component = name
            break
          }
        }
      } catch (e) {}
      return out
    }

    function describe(el) {
      var cs = window.getComputedStyle(el)
      var styles = {}
      for (var i = 0; i < STYLE_KEYS.length; i++) styles[STYLE_KEYS[i]] = cs.getPropertyValue(STYLE_KEYS[i])
      var rect = el.getBoundingClientRect()
      var pick = {
        url: location.href,
        tag: el.localName,
        selector: selectorFor(el),
        text: String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        size: { width: Math.round(rect.width), height: Math.round(rect.height) },
        styles: styles,
      }
      var role = roleOf(el)
      if (role) pick.role = role
      var react = reactInfo(el)
      if (react.component) pick.component = react.component
      if (react.source) pick.source = react.source
      return pick
    }

    // Audit: the signs of generic machine-made UI that computed styles can show (skills/restyle-rules, section 5).
    // Each rule id is a key of SIGNS in hooks/audit.ts; checks/audit.check.ts holds the two lists together.
    // Ten rules report elements and four report the page: 2 each for the ten, 1 each for the four, is 24 at most.
    var PER_RULE = 2
    var MAX_FINDINGS = 24
    var MIN_TARGET = 40 // px, each way
    var MAX_VALUES = 2 // distinct corner radii, and distinct durations on controls, before the audit reports them
    var MAX_BYTES = 60000 // the bridge refuses an audit body over 65536 bytes
    var BUZZ = /\b(seamless(ly)?|unlock|ai[- ]powered|supercharge|effortless(ly)?|revolutioni[sz]e)\b/i
    var EMOJI = null
    try {
      // Not plain \p{Extended_Pictographic}: that also matches ©, ® and ™ in text.
      EMOJI = new RegExp('^\\s*(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)', 'u')
    } catch (e) {}

    // True when a gradient holds a saturated colour between blue-violet and purple.
    function purple(bg) {
      var re = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/g
      for (var m = re.exec(bg); m; m = re.exec(bg)) {
        var r = m[1] / 255, g = m[2] / 255, b = m[3] / 255
        var max = Math.max(r, g, b), d = max - Math.min(r, g, b)
        if (d < 0.25 || max < 0.35) continue
        var h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
        h = (h * 60 + 360) % 360
        if (h >= 235 && h <= 300) return true
      }
      return false
    }

    // True when a cubic-bezier leaves the 0..1 range: the curve overshoots.
    function bouncy(timing) {
      var re = /cubic-bezier\(\s*[-\d.]+\s*,\s*([-\d.]+)\s*,\s*[-\d.]+\s*,\s*([-\d.]+)\s*\)/g
      for (var m = re.exec(timing); m; m = re.exec(timing)) {
        if (+m[1] < 0 || +m[1] > 1 || +m[2] < 0 || +m[2] > 1) return true
      }
      return false
    }

    // The selectors of every rule with :active, with that part cut out. A sheet from another origin cannot be read.
    function pressRules() {
      var out = { selectors: [], sheets: 0 }
      var walk = function (rules) {
        for (var i = 0; i < rules.length; i++) {
          var sel = rules[i].selectorText
          if (sel && sel.indexOf(':active') >= 0) out.selectors.push(sel.replace(/:active/g, ''))
          if (rules[i].cssRules) walk(rules[i].cssRules)
        }
      }
      try {
        for (var s = 0; s < document.styleSheets.length; s++) {
          try {
            walk(document.styleSheets[s].cssRules)
            out.sheets++
          } catch (e) {}
        }
      } catch (e) {}
      return out
    }

    // True when the author set the line breaks of a heading: a <br>, or a child that is a block.
    function forcedBreaks(el) {
      if (el.querySelector && el.querySelector('br')) return true
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        var d = window.getComputedStyle(c).getPropertyValue('display')
        if (d === 'block' || d === 'flex' || d === 'grid') return true
      }
      return false
    }

    // The number of text lines in an element: its line boxes, counted by where each starts. The box height alone is
    // wrong for a one-line heading that holds a tall link. Without ranges (a test stub): height over line height.
    function lineCount(el, box, line) {
      try {
        var range = document.createRange()
        range.selectNodeContents(el)
        var rects = range.getClientRects()
        var tops = []
        for (var i = 0; i < rects.length; i++) if (rects[i].width > 0) tops.push(rects[i].top)
        tops.sort(function (a, b) {
          return a - b
        })
        var lines = tops.length ? 1 : 0
        for (var j = 1; j < tops.length; j++) if (tops[j] - tops[j - 1] > line / 2) lines++
        return lines
      } catch (e) {
        return line > 0 ? Math.round(box.height / line) : 1
      }
    }

    // 'a ×3, b ×1' for the keys of a tally, most used first.
    function tallyText(map) {
      var keys = Object.keys(map).sort(function (a, b) {
        return map[b].n - map[a].n
      })
      for (var i = 0; i < keys.length; i++) keys[i] = keys[i] + ' ×' + map[keys[i]].n
      return keys.join(', ')
    }

    function audit() {
      var press = pressRules()
      var hasPress = function (el) {
        for (var i = 0; i < press.selectors.length; i++) {
          try {
            if (el.matches(press.selectors[i])) return true
          } catch (e) {}
        }
        return false
      }
      var radii = {}
      var durations = {}
      var count = function (map, key, el) {
        if (map[key]) map[key].n++
        else map[key] = { n: 1, el: el }
      }
      var found = []
      var counts = {}
      var add = function (rule, el, detail) {
        counts[rule] = (counts[rule] || 0) + 1
        if (counts[rule] <= PER_RULE) found.push({ rule: rule, el: el, detail: detail })
      }
      var blurred = []
      var cards = {}
      var blocks = 0
      var centred = 0
      var els = document.querySelectorAll('body *')
      // shortcut: the first 3000 elements only, so a huge page stays fast; raise it if real pages get cut.
      for (var i = 0; i < els.length && i < 3000; i++) {
        var el = els[i]
        var tag = el.localName
        if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript') continue
        var cs = window.getComputedStyle(el)
        var css = function (k) {
          return String(cs.getPropertyValue(k) || '')
        }
        // Not rendered (display none on it or on an ancestor): the person cannot see it at this width.
        if (css('display') === 'none' || (el.getClientRects && el.getClientRects().length === 0)) continue
        var bg = css('background-image')
        var isGradient = bg.indexOf('gradient') >= 0
        var isClipped = css('background-clip') === 'text' || css('-webkit-background-clip') === 'text'
        var text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
        var isBlock = tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p'

        if (isGradient && isClipped) add('gradient-text', el, 'The text is filled with a gradient.')
        else if (isGradient && purple(bg)) add('purple-gradient', el, 'The background is a purple or blue-violet gradient.')
        if ((css('backdrop-filter') + css('-webkit-backdrop-filter')).indexOf('blur') >= 0) blurred.push(el)
        if (bouncy(css('transition-timing-function') + ' ' + css('animation-timing-function'))) add('bounce', el, 'The easing curve overshoots.')
        if ((isBlock || tag === 'button' || tag === 'a') && BUZZ.test(text)) add('buzzword', el, 'The copy uses the word "' + BUZZ.exec(text)[0] + '".')
        if (EMOJI && el.childElementCount === 0 && EMOJI.test(text)) add('emoji-icon', el, 'An emoji stands in for an icon.')

        var radius = parseFloat(css('border-radius')) || 0
        var shadow = css('box-shadow')
        if (radius >= 16 && shadow && shadow !== 'none' && el.getBoundingClientRect().width > 120) {
          var key = radius + 'px|' + shadow
          ;(cards[key] = cards[key] || []).push(el)
        }
        if (tag === 'h1' || tag === 'h2') {
          var badge = el.previousElementSibling
          if (badge) {
            var h = badge.getBoundingClientRect().height
            var words = String(badge.innerText || badge.textContent || '').trim()
            var round = parseFloat(window.getComputedStyle(badge).getPropertyValue('border-radius')) || 0
            if (h > 0 && h <= 40 && round >= h / 2 && words && words.length <= 40) add('pill-badge', badge, 'A pill badge sits above the headline.')
          }
        }
        if (isBlock && text) {
          blocks++
          if (css('text-align') === 'center') centred++
        }

        // Craft checks: the page against itself and against the rules in skills/restyle-rules.
        var box = el.getBoundingClientRect()
        var type = tag === 'input' ? String(el.getAttribute('type') || 'text').toLowerCase() : ''
        var isButton = tag === 'button' || el.getAttribute('role') === 'button'
        var isControl = isButton || (tag === 'a' && el.hasAttribute('href')) || tag === 'select' || tag === 'textarea' ||
          (tag === 'input' && type !== 'hidden' && type !== 'checkbox' && type !== 'radio')
        if (isButton && press.sheets > 0 && !el.disabled && !hasPress(el)) add('no-press', el, 'No :active rule in the stylesheets matches this button.')
        if (isControl) {
          // A link inside a sentence is not held to the size: its line sets the height.
          var around = el.parentElement ? String(el.parentElement.innerText || el.parentElement.textContent || '').replace(/\s+/g, ' ').trim() : ''
          var inSentence = tag === 'a' && css('display') === 'inline' && around.length > text.length
          // 4 px and under: hidden for screen readers only, for example a skip link.
          var wide = Math.round(box.width)
          var high = Math.round(box.height)
          if (!inSentence && wide > 4 && high > 4 && (wide < MIN_TARGET || high < MIN_TARGET)) {
            add('small-target', el, 'The control is ' + wide + ' by ' + high + ' px. A hit area needs ' + MIN_TARGET + ' by ' + MIN_TARGET + ' px.')
          }
          var ms = Math.round(parseFloat(css('transition-duration')) * 1000)
          if (ms > 0) count(durations, ms + ' ms', el)
        }
        // A corner radius counts on a box that shows its edge, and is not a pill or a circle.
        var hasEdge = parseFloat(css('border-top-width')) > 0 || (shadow && shadow !== 'none') || !/^(|transparent|rgba\(0, 0, 0, 0\))$/.test(css('background-color'))
        if (radius > 0 && hasEdge && css('border-radius').indexOf('%') < 0 && box.width >= 24 && box.height >= 24 && radius < Math.min(box.width, box.height) / 2) {
          count(radii, radius + 'px', el)
        }
        if ((tag === 'h1' || tag === 'h2' || tag === 'h3') && text) {
          var wrap = css('text-wrap') + ' ' + css('text-wrap-style')
          var line = parseFloat(css('line-height')) || parseFloat(css('font-size')) * 1.2
          if (line > 0 && lineCount(el, box, line) > 1 && wrap.indexOf('balance') < 0 && wrap.indexOf('pretty') < 0 && !forcedBreaks(el)) add('heading-wrap', el, 'The heading runs over more than one line and its lines are not balanced.')
        }
      }
      var least = function (map) {
        var keys = Object.keys(map).sort(function (a, b) {
          return map[a].n - map[b].n
        })
        return map[keys[0]].el
      }
      if (Object.keys(radii).length > MAX_VALUES) add('many-radii', least(radii), 'The page uses these corner radii: ' + tallyText(radii) + '.')
      if (Object.keys(durations).length > MAX_VALUES) add('many-durations', least(durations), 'The controls use these transition durations: ' + tallyText(durations) + '.')
      if (blurred.length >= 3) {
        for (var b = 0; b < blurred.length; b++) add('glass-blur', blurred[b], 'The surface uses a backdrop blur.')
      }
      for (var k in cards) {
        if (cards[k].length >= 4) add('same-card', cards[k][0], cards[k].length + ' surfaces share the radius ' + k.split('|')[0] + ' and the same shadow.')
      }
      if (blocks >= 6 && centred / blocks >= 0.7) add('all-centred', document.body, centred + ' of ' + blocks + ' text blocks are centred.')

      var out = { url: location.href, findings: [] }
      for (var j = 0; j < found.length && j < MAX_FINDINGS; j++) {
        var f = found[j]
        var n = counts[f.rule]
        out.findings.push({ rule: f.rule, detail: f.detail + (n > 1 && f.rule !== 'same-card' ? ' ' + n + ' on this page.' : ''), pick: describe(f.el) })
      }
      var bytes = function () {
        var s = JSON.stringify(out)
        return window.TextEncoder ? new TextEncoder().encode(s).length : s.length * 3
      }
      while (out.findings.length && bytes() > MAX_BYTES) out.findings.pop()
      return out
    }

    window.__restyle = { describe: describe, selectorFor: selectorFor, audit: audit }

    // Live part: needs the script's own URL for the endpoint and token.
    var script = document.currentScript
    if (!script || !script.src || window.__restyleLive) return
    window.__restyleLive = true
    var src = new URL(script.src)
    var endpoint = src.origin
    var token = src.searchParams.get('t') || ''

    function post(path, body) {
      try {
        fetch(endpoint + path + '?t=' + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(function () {})
      } catch (e) {}
    }

    var overlay = null
    var current = null
    function place(el) {
      try {
        if (!overlay) {
          overlay = document.createElement('div')
          overlay.setAttribute('data-restyle-overlay', '')
          overlay.style.cssText =
            'all:initial;position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;' +
            'border:2px solid #3b82f6;background:rgba(59,130,246,0.12);border-radius:2px;display:none;'
          document.documentElement.appendChild(overlay)
        }
        current = el
        if (!el || el === overlay) {
          overlay.style.display = 'none'
          return
        }
        var r = el.getBoundingClientRect()
        overlay.style.left = r.left + 'px'
        overlay.style.top = r.top + 'px'
        overlay.style.width = r.width + 'px'
        overlay.style.height = r.height + 'px'
        overlay.style.display = 'block'
      } catch (e) {}
    }
    function hide() {
      if (overlay) overlay.style.display = 'none'
      current = null
    }

    var hovered = null
    window.addEventListener('mousemove', function (e) {
      hovered = e.target
      if (e.altKey) place(hovered)
      else if (current) hide()
    }, { capture: true, passive: true })
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Alt' && hovered) place(hovered)
    }, true)
    window.addEventListener('keyup', function (e) {
      if (e.key === 'Alt') hide()
    }, true)
    window.addEventListener('blur', hide)
    window.addEventListener('scroll', function () {
      if (current) place(current)
    }, { capture: true, passive: true })

    window.addEventListener('click', function (e) {
      if (!e.altKey || !e.target || e.target.nodeType !== 1) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      try {
        post('/pick', describe(e.target))
        place(e.target)
        overlay.style.background = 'rgba(59,130,246,0.45)'
        setTimeout(function () {
          if (overlay) overlay.style.background = 'rgba(59,130,246,0.12)'
        }, 180)
      } catch (err) {}
    }, true)

    post('/hello', { url: location.href })

    // The audit runs once the page has settled, and again on Alt+Shift+A.
    function runAudit() {
      try {
        post('/audit', audit())
      } catch (e) {}
    }
    var later = function () {
      setTimeout(runAudit, 500)
    }
    if (document.readyState === 'complete') later()
    else window.addEventListener('load', later)
    window.addEventListener('keydown', function (e) {
      if (!e.altKey || !e.shiftKey || e.code !== 'KeyA') return
      e.preventDefault()
      runAudit()
    }, true)
  } catch (e) {}
})()
