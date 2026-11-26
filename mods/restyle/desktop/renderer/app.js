// restyle desktop: the window. It holds no file and no secret: it asks the main process through `window.restyle`
// (preload.cjs). Everything from an audited page is data: text goes through `esc`, images through IMAGE, and the
// live copy of an element sits in a frame with no script permission.
;(function () {
  'use strict'
  const NONCE = document.currentScript.nonce // a frame made from `srcdoc` is under this page's policy: its styles need the nonce
  const api = window.restyle
  const IMAGE = /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/
  const ROOT = '[data-restyle-root]' // the copied element: `&` in a recipe's patch
  const MAX_PICKS = 8
  const ORDER = ['motion', 'type', 'visual', 'effect']
  const MARK = { open: '○', accepted: '✓', dismissed: '–' }

  const $ = (id) => document.getElementById(id)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const say = (text) => ($('say').textContent = String(text))
  // Electron puts its own words before the message of a failed call.
  const why = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const path = (url) => {
    try {
      const u = new URL(url)
      return u.pathname + u.search
    } catch {
      return String(url)
    }
  }

  const st = { view: 'board', board: null, catalog: [], cur: '', filter: 'all', drafts: {}, shelf: [], prompts: {}, cat: { q: '', c: 'all', live: false, open: '' } }

  const cards = () => (st.board ? st.board.cards.filter((c) => c && typeof c.id === 'string') : [])
  const cur = () => cards().find((c) => c.id === st.cur)
  const statusOf = (c) => (c.verdict ? (c.verdict.verdict === 'accept' ? 'accepted' : 'dismissed') : 'open')
  const count = (s) => cards().filter((c) => statusOf(c) === s).length
  const visible = () => cards().filter((c) => st.filter === 'all' || statusOf(c) === st.filter)
  const recipeOf = (id) => {
    const r = st.board && st.board.recipes && Object.hasOwn(st.board.recipes, id) ? st.board.recipes[id] : null
    return r && typeof r.patch === 'string' && typeof r.name === 'string' ? r : null
  }
  const shelfOf = (c) => (Array.isArray(c.shelf) ? c.shelf : []).filter((id) => typeof id === 'string' && recipeOf(id))
  const capsuleOf = (c) => (c.capsule && typeof c.capsule.html === 'string' && typeof c.capsule.css === 'string' ? c.capsule : null)

  // What the reviewer has set on a card and not yet sent. A card opens with its fix picked, when the fix has a patch.
  function draft(c) {
    if (st.drafts[c.id]) return st.drafts[c.id]
    const shelf = shelfOf(c)
    const stored = c.verdict && Array.isArray(c.verdict.picks) ? c.verdict.picks.filter((id) => shelf.includes(id)) : null
    return (st.drafts[c.id] = { picks: stored || (shelf.includes(c.fixId) ? [c.fixId] : []), comment: String(c.verdict?.comment || ''), reason: String(c.verdict?.reason || ''), asking: false })
  }

  // The document of a frame: the copy of the element, then the patch of each picked recipe, later ones last.
  function frameDoc(capsule, ids) {
    const patches = ids.map(recipeOf).filter(Boolean).map((r) => r.patch.split('&').join(ROOT))
    return `<!doctype html><meta charset="utf-8"><style nonce="${NONCE}">html,body{margin:0}body{padding:24px;${capsule.backdrop ? 'background:' + capsule.backdrop : ''}}\n${capsule.css}</style><style nonce="${NONCE}">${patches.join('\n')}</style>${capsule.html}`
  }
  // The frame runs no script and sends no form: `sandbox` with no permission.
  function frame(capsule, ids, title) {
    const f = document.createElement('iframe')
    f.setAttribute('sandbox', '')
    f.title = title
    f.width = Math.min((Number(capsule.width) || 1) + 64, 760)
    f.height = Math.min((Number(capsule.height) || 1) + 72, 640)
    f.srcdoc = frameDoc(capsule, ids)
    return f
  }

  // ---------- board ----------

  function drawList() {
    $('filters').innerHTML = ['all', 'open', 'accepted', 'dismissed'].map((k) => `<button type="button" data-f="${k}" aria-pressed="${st.filter === k}">${k[0].toUpperCase() + k.slice(1)} ${k === 'all' ? cards().length : count(k)}</button>`).join('')
    $('list').innerHTML =
      visible().map((c) => `<button type="button" class="row ${statusOf(c)}" data-id="${esc(c.id)}" aria-current="${c.id === st.cur}"><span class="mark" aria-hidden="true">${MARK[statusOf(c)]}</span><span><strong>${esc(c.name)}</strong><small>${esc(path(c.page))} · ${c.tier === 'craft' ? 'craft' : 'generic'} · ${statusOf(c)}</small></span></button>`).join('') ||
      `<p class="empty">${cards().length ? `No finding is ${st.filter}.` : 'No finding.'}</p>`
  }

  function drawPicks() {
    const c = cur()
    if (!c) return
    const d = draft(c)
    const open = statusOf(c) === 'open'
    const variant = document.querySelector('#detail iframe[data-variant]')
    const doc = variant ? frameDoc(capsuleOf(c), d.picks) : ''
    if (variant && variant.srcdoc !== doc) variant.srcdoc = doc // the same document again would load the frame twice
    if ($('variant-cap')) $('variant-cap').textContent = d.picks.length ? `Variant (${d.picks.length} ${d.picks.length === 1 ? 'recipe' : 'recipes'})` : 'Variant (no recipe yet)'
    for (const chip of document.querySelectorAll('#detail .chip')) chip.setAttribute('aria-pressed', String(d.picks.includes(chip.dataset.pick)))
    if ($('picked')) {
      $('picked').innerHTML = d.picks.length
        ? `<ol class="stack">${d.picks.map((id) => `<li>${esc(recipeOf(id).name)}${open ? `<button type="button" data-pick="${esc(id)}">remove</button>` : ''}</li>`).join('')}</ol>`
        : '<p class="note">Nothing picked. An accept then uses the fix of the finding alone.</p>'
    }
  }

  function drawDetail() {
    const c = cur()
    if (!c) {
      st.shelf = []
      $('detail').innerHTML = st.board
        ? `<p class="empty">${cards().length ? 'Select a finding.' : 'The audit found nothing on these pages.'}</p>`
        : '<div class="empty-state"><h2>No board yet</h2><p>Give the address of a web app that runs now, then press Run audit. The audit reads up to that many pages at 1440 and 390 px. It does not sign in, click or submit.</p><p>It needs Chrome or Chromium on this machine.</p></div>'
      return
    }
    const d = draft(c)
    const status = statusOf(c)
    const open = status === 'open'
    const shelf = shelfOf(c)
    const capsule = capsuleOf(c)
    st.shelf = open && capsule ? shelf : []
    const hasBefore = typeof c.before === 'string' && IMAGE.test(c.before)
    const hasAfter = hasBefore && typeof c.after === 'string' && IMAGE.test(c.after)
    const list = (items) => (Array.isArray(items) && items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')

    const banner =
      status === 'accepted' ? '<div class="banner ok"><p><strong>Accepted.</strong> Its prompt is in the queue.</p><button type="button" class="btn" data-go="queue">Open the queue</button><button type="button" class="btn" data-act="reopen">Reopen</button></div>'
      : status === 'dismissed' ? `<div class="banner"><p><strong>Dismissed.</strong> ${esc(c.verdict.reason || '')} The next audit of this app leaves this finding out.</p><button type="button" class="btn" data-act="reopen">Reopen</button></div>`
      : ''
    const crops = hasBefore
      ? `<div class="block"><h3>On the page</h3><div class="stage"><figure><figcaption>Before</figcaption><img data-crop alt="Before: ${esc(c.name)}" src="${c.before}"></figure>${hasAfter ? `<figure><figcaption>After (a preview by a CSS patch)</figcaption><img data-crop alt="After: ${esc(c.name)}" src="${c.after}"></figure>` : ''}</div>${list(c.changed)}</div>`
      : ''
    const live = capsule
      ? `<div class="block"><h3>Live copy<small>this element with its computed styles; hover it and press it</small></h3><div class="stage"><figure><figcaption>Before (live copy)</figcaption><span data-frame="copy"></span></figure><figure><figcaption id="variant-cap"></figcaption><span data-frame="variant"></span></figure></div></div>
         <div class="block"><h3>Shelf<small>recipes that fit this element; they stack on the variant</small></h3><div class="chips">${shelf.map((id, i) => `<button type="button" class="chip ${esc(recipeOf(id).category)}" data-pick="${esc(id)}"${open ? '' : ' disabled'}><i></i>${id === c.fixId ? '<em class="fixmark">Fix</em>' : ''}<span>${esc(recipeOf(id).name)}</span>${open && i < 9 ? `<kbd>${i + 1}</kbd>` : ''}</button>`).join('') || '<span class="note">No recipe with a live preview fits this element.</span>'}</div></div>
         <div class="block"><h3>Picked<small>applied in this order</small></h3><div id="picked"></div></div>
         ${Array.isArray(c.more) && c.more.length ? `<p class="note">These fit too, with no live preview (they add markup or need a script): ${esc(c.more.join(', '))}.</p>` : ''}
         ${Array.isArray(capsule.gaps) && capsule.gaps.length ? `<p class="note">What the copy does not show: ${esc(capsule.gaps.join(' '))}</p>` : ''}`
      : c.noCapsule ? `<p class="note">No live copy: ${esc(c.noCapsule)}</p>` : ''
    const actions = !open ? ''
      : `<div class="actions"><input class="field" id="comment" type="text" maxlength="500" placeholder="Comment for the prompt (optional)" aria-label="Comment" value="${esc(d.comment)}"><button type="button" class="btn primary" data-act="accept">Accept <kbd>A</kbd></button><button type="button" class="btn" data-act="ask">Dismiss <kbd>D</kbd></button>${d.asking ? `<form id="dismiss-form"><input class="field" id="reason" type="text" maxlength="500" placeholder="Reason, for example: brand colour, on purpose" aria-label="Reason" value="${esc(d.reason)}"><button class="btn" type="submit">Save</button><button class="btn" type="button" data-act="cancel">Cancel</button></form>` : ''}</div>`

    $('detail').innerHTML = `
      <header>
        <p class="eyebrow">${c.tier === 'craft' ? 'Craft check' : 'Sign of generic UI'}</p>
        <h2>${esc(c.name)}</h2>
        <p class="fixline">${esc(c.fix)}</p>
        <dl class="meta"><div><dt>Page</dt><dd>${esc(path(c.page))}</dd></div><div><dt>Element</dt><dd><code>${esc(c.pick?.selector)}</code></dd></div><div><dt>Widths</dt><dd>${esc((Array.isArray(c.widths) ? c.widths : []).join(', '))} px</dd></div></dl>
      </header>
      ${banner}
      ${c.detail ? `<p class="note">${esc(c.detail)}</p>` : ''}
      ${crops}
      ${live}
      ${actions}`

    // The crops are two device pixels for each CSS pixel.
    for (const img of document.querySelectorAll('#detail img[data-crop]')) {
      const fit = () => (img.width = Math.round(img.naturalWidth / 2))
      img.complete && img.naturalWidth ? fit() : img.addEventListener('load', fit)
    }
    if (capsule) {
      document.querySelector('[data-frame="copy"]').replaceWith(frame(capsule, [], `Live copy: ${c.name}`))
      const variant = frame(capsule, d.picks, `Variant: ${c.name}`)
      variant.dataset.variant = ''
      document.querySelector('[data-frame="variant"]').replaceWith(variant)
    }
    drawPicks()
    if (d.asking) $('reason').focus()
  }

  function select(id) {
    st.cur = id
    drawList()
    drawDetail()
  }
  function move(step) {
    const rows = visible()
    const next = rows[Math.max(0, Math.min(rows.length - 1, rows.findIndex((c) => c.id === st.cur) + step))]
    if (!next || next.id === st.cur) return
    select(next.id)
    document.querySelector('.row[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }
  function toggle(id) {
    const c = cur()
    if (!c || statusOf(c) !== 'open' || !shelfOf(c).includes(id)) return
    const d = draft(c)
    const at = d.picks.indexOf(id)
    if (at >= 0) d.picks.splice(at, 1)
    else if (d.picks.length < MAX_PICKS) d.picks.push(id)
    else return say(`A finding takes ${MAX_PICKS} recipes at most.`)
    drawPicks()
  }
  // Sends a verdict. After an accept or a dismiss the next open finding is shown, like an inbox.
  async function settle(verdict) {
    const c = cur()
    if (!c) return
    const d = draft(c)
    try {
      const stored = await api.verdict({ id: c.id, verdict, reason: d.reason, comment: d.comment, picks: d.picks })
      if (stored) c.verdict = stored
      else delete c.verdict
    } catch (err) {
      return say(why(err))
    }
    d.asking = false
    if (verdict !== 'open') {
      const all = cards()
      const at = all.indexOf(c)
      const next = [...all.slice(at + 1), ...all.slice(0, at)].find((x) => statusOf(x) === 'open')
      if (next) st.cur = next.id
    }
    say(verdict === 'accept' ? `Accepted: ${c.name}. ${count('accepted')} in the queue.` : verdict === 'dismiss' ? `Dismissed: ${c.name}.` : `Open again: ${c.name}.`)
    draw()
  }
  function act(name) {
    const c = cur()
    if (!c) return
    if (name === 'reopen') return settle('open')
    if (statusOf(c) !== 'open') return
    if (name === 'accept') return settle('accept')
    draft(c).asking = name === 'ask'
    drawDetail()
  }

  // ---------- queue ----------

  async function drawQueue() {
    const accepted = cards().filter((c) => statusOf(c) === 'accepted')
    if (!accepted.length) {
      $('v-queue').innerHTML = '<div class="empty-state"><h2>No prompt yet</h2><p>Accept a finding on the board. Its prompt lands here. Copy it into your coding agent, read it, then send it.</p><button type="button" class="btn" data-go="board">Open the board</button></div>'
      return
    }
    let texts
    try {
      texts = await Promise.all(accepted.map((c) => api.prompt(c.id)))
    } catch (err) {
      return say(why(err))
    }
    if (st.view !== 'queue') return
    st.prompts = Object.fromEntries(accepted.map((c, i) => [c.id, String(texts[i] || '')]))
    $('v-queue').innerHTML =
      `<h2>Queue</h2><div class="q-top"><p>${accepted.length} ${accepted.length === 1 ? 'prompt' : 'prompts'}, one for each accepted finding.</p><button type="button" class="btn primary" data-copy="all">Copy all</button></div>` +
      accepted.map((c) => `<article class="q-item"><header><strong>${esc(c.name)}</strong><span>${esc(path(c.page))} · ${c.verdict.picks?.length ? esc(c.verdict.picks.map((id) => recipeOf(id)?.name || id).join(', ')) : 'the fix of the finding'}</span><button type="button" class="btn" data-copy="${esc(c.id)}">Copy</button></header><pre>${esc(st.prompts[c.id])}</pre></article>`).join('')
  }

  // ---------- catalog ----------

  function drawCatalog() {
    const c = st.cat
    const q = c.q.trim().toLowerCase()
    const rows = st.catalog
      .filter((r) => (c.c === 'all' || r.category === c.c) && (!c.live || r.patch !== undefined) && (!q || `${r.name} ${r.appliesTo.join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name))
    $('cats').innerHTML = ['all', ...ORDER].map((k) => `<button type="button" data-c="${k}" aria-pressed="${c.c === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')
    $('cat-count').textContent = `${rows.length} of ${st.catalog.length} recipes`
    $('cat-rows').innerHTML =
      rows.map((r) => `<li class="${esc(r.category)}"><button type="button" class="cat-row" data-r="${esc(r.id)}" aria-expanded="${c.open === r.id}"><i></i><span>${esc(r.name)}</span><span class="k">${esc(r.category)} · ${esc(r.appliesTo.join(', '))}</span><span class="p">${r.patch !== undefined ? 'Live' : ''}</span></button>${c.open === r.id ? `<div class="cat-d"><p>${esc(r.when)}</p>${r.patch !== undefined ? `<pre>${esc(r.patch)}</pre>` : '<p class="muted">No patch. This recipe adds markup, needs a script, or needs a state, so the board cannot preview it.</p>'}</div>` : ''}</li>`).join('') ||
      '<li class="empty">No recipe matches.</li>'
  }

  // ---------- the window ----------

  function draw() {
    for (const k of ['board', 'queue', 'catalog']) $(`v-${k}`).hidden = st.view !== k
    for (const b of document.querySelectorAll('.nav button')) b.setAttribute('aria-current', b.dataset.view === st.view ? 'page' : 'false')
    $('n-board').textContent = count('open')
    $('n-queue').textContent = count('accepted')
    $('n-catalog').textContent = st.catalog.length
    const b = st.board
    const made = b ? new Date(String(b.made || '')) : null
    const pages = b && Array.isArray(b.pages) ? b.pages.length : 0
    $('last').innerHTML = b ? `<code>${esc(b.origin)}</code>${pages} ${pages === 1 ? 'page' : 'pages'} · ${cards().length} ${cards().length === 1 ? 'finding' : 'findings'}${made && !isNaN(made) ? ` · ${esc(made.toLocaleString())}` : ''}` : 'None yet.'
    if (st.view === 'board') {
      drawList()
      drawDetail()
    }
    if (st.view === 'queue') drawQueue()
    if (st.view === 'catalog') drawCatalog()
  }
  function go(view) {
    st.view = view
    draw()
  }
  function take(board) {
    st.board = board && Array.isArray(board.cards) ? board : null
    st.drafts = {}
    st.filter = 'all'
    st.cur = (cards().find((c) => statusOf(c) === 'open') || cards()[0])?.id || ''
  }

  document.querySelector('.nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]')
    if (b) go(b.dataset.view)
  })
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]')
    if (!b) return
    st.filter = b.dataset.f
    const rows = visible()
    if (rows.length && !rows.some((c) => c.id === st.cur)) st.cur = rows[0].id
    draw()
  })
  $('list').addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]')
    if (r) select(r.dataset.id)
  })
  $('detail').addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick], [data-act], [data-go]')
    if (!t) return
    if (t.dataset.pick) toggle(t.dataset.pick)
    else if (t.dataset.act) act(t.dataset.act)
    else go(t.dataset.go)
  })
  $('detail').addEventListener('input', (e) => {
    const c = cur()
    if (c && (e.target.id === 'comment' || e.target.id === 'reason')) draft(c)[e.target.id] = e.target.value
  })
  $('detail').addEventListener('submit', (e) => {
    e.preventDefault()
    settle('dismiss')
  })
  $('v-queue').addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]')
    if (g) return go(g.dataset.go)
    const b = e.target.closest('[data-copy]')
    if (!b) return
    const text = b.dataset.copy === 'all' ? Object.values(st.prompts).join('\n\n---\n\n') : st.prompts[b.dataset.copy] || ''
    api.copy(text).then(() => say('Copied to the clipboard.'), (err) => say(why(err)))
  })
  $('q').addEventListener('input', (e) => {
    st.cat.q = e.target.value
    drawCatalog()
  })
  $('live').addEventListener('change', (e) => {
    st.cat.live = e.target.checked
    drawCatalog()
  })
  $('cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]')
    if (!b) return
    st.cat.c = b.dataset.c
    drawCatalog()
  })
  $('cat-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]')
    if (!b) return
    st.cat.open = st.cat.open === b.dataset.r ? '' : b.dataset.r
    drawCatalog()
  })
  $('run').addEventListener('submit', async (e) => {
    e.preventDefault()
    $('go').disabled = true
    say('Starting the audit.')
    try {
      take(await api.run($('url').value, $('pages').value))
      st.view = 'board'
      say(`${cards().length} ${cards().length === 1 ? 'finding' : 'findings'} on ${st.board.pages.length} ${st.board.pages.length === 1 ? 'page' : 'pages'}.`)
      draw()
    } catch (err) {
      say(why(err))
    }
    $('go').disabled = false
  })
  document.addEventListener('keydown', (e) => {
    if (st.view !== 'board' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select')) return
    const k = e.key.toLowerCase()
    if (k === 'j' || k === 'k') move(k === 'j' ? 1 : -1)
    else if (k === 'a') act('accept')
    else if (k === 'd') {
      e.preventDefault() // or the letter lands in the reason field
      act('ask')
    } else if (k >= '1' && k <= '9' && st.shelf[k - 1]) toggle(st.shelf[k - 1])
  })

  if (!api) return say('This page is the window of the restyle desktop app. Start it with: npm start')
  api.onProgress(say)
  api.state().then(
    ({ board, catalog }) => {
      st.catalog = Array.isArray(catalog) ? catalog : []
      take(board)
      if (st.board) $('url').value = String(st.board.origin || $('url').value)
      say(st.board ? 'The board of the last audit.' : 'Ready.')
      draw()
    },
    (err) => say(why(err)),
  )
})()
