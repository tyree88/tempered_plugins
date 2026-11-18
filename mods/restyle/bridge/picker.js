// restyle picker: Alt+hover outlines an element, Alt+click sends it to the bridge. Contract C3 in the plan.
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

    window.__restyle = { describe: describe, selectorFor: selectorFor }

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
  } catch (e) {}
})()
