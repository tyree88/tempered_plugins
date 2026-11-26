// restyle driver: audits a URL with no change to the audited app, and writes the board's data file.
// It starts a headless Chrome, talks to it over the DevTools Protocol with Node's own WebSocket, and puts picker.js
// in each page with Runtime.evaluate, which a page's content security policy does not hold.
// It reads pages. It does not sign in, click or submit. Needs Node 22.18 or later (WebSocket, and the .ts import).
//
//   node bridge/audit-url.mjs <url> [more urls] [--pages 5] [--out <board.json>]
//
// Prints one JSON line for each step: `progress`, then `board` (the cards without their images) or `error`.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keep, signOf } from '../hooks/audit.ts'
import { shelf } from '../hooks/match.ts'
import { parseRecipe } from '../hooks/recipes.ts'
import { CAPSULE_NODES, HTML_TAGS, SVG_TAGS, capsuleOf, copyInPage, defaultsInPage } from './capsule.mjs'
import { cleanFindings } from './clean.mjs'

/** The recipes of the catalog that parse: the board's shelf reads them. */
export function loadRecipes(root = fileURLToPath(new URL('../recipes', import.meta.url))) {
  const out = []
  for (const category of existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()) : []) {
    for (const file of readdirSync(join(root, category.name)).filter((f) => f.endsWith('.md'))) {
      const parsed = parseRecipe(file.slice(0, -3), category.name, readFileSync(join(root, category.name, file), 'utf8'))
      if (parsed.ok) out.push(parsed.recipe)
    }
  }
  return out
}

export const WIDTHS = [1440, 390] // px: a desktop and a phone. The first width that shows a finding gives its crop.
const PAD = 24 // px of page around the element in a crop
const MAX_CROP = { width: 1440, height: 900 }
const MIN_TARGET = 40

// The findings that a CSS patch can show, by rule id (a key of SIGNS in hooks/audit.ts): the declarations that the
// driver sets on the element for the "after" crop. The patch is a preview. The fix prompt makes the real change.
export const PATCHES = {
  // The picker's detail lists the radii most used first: "… corner radii: 12px ×5, 10px ×2, 14px ×1."
  'many-radii': (f) => {
    const most = /: (\d+(?:\.\d+)?px) ×/.exec(f.detail)
    return most ? { 'border-radius': most[1] } : null
  },
  'small-target': (f) => {
    const decl = {}
    if (f.pick.size.width < MIN_TARGET) decl['min-width'] = `${MIN_TARGET}px`
    if (f.pick.size.height < MIN_TARGET) decl['min-height'] = `${MIN_TARGET}px`
    if (!Object.keys(decl).length) return null
    // An inline box takes no minimum size.
    if (f.pick.styles.display === 'inline') Object.assign(decl, { display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center' })
    return { ...decl, 'box-sizing': 'border-box' }
  },
  'heading-wrap': () => ({ 'text-wrap': 'balance' }),
}

/** The declarations that show a finding's fix, or null when no CSS patch can show it. */
export const patchFor = (finding) => (Object.hasOwn(PATCHES, finding.rule) ? PATCHES[finding.rule](finding) : null)

/** The part of the page to capture: the element's box with padding, kept inside the page and under the size limit. */
export function clipFor(box, pad = PAD) {
  const x = Math.max(0, Math.floor(box.x - pad))
  const y = Math.max(0, Math.floor(box.y - pad))
  const width = Math.min(Math.ceil(box.x + box.width + pad), box.pageWidth) - x
  const height = Math.min(Math.ceil(box.y + box.height + pad), box.pageHeight) - y
  if (!(box.width > 0 && box.height > 0 && width > 0 && height > 0)) return null
  return { x, y, width: Math.min(width, MAX_CROP.width), height: Math.min(height, MAX_CROP.height) }
}

/** What the board shows as changed: each value that differs between the two measures. */
export function changes(before, after) {
  const out = []
  const size = (m) => `${Math.round(m.width)} by ${Math.round(m.height)} px`
  if (size(before) !== size(after)) out.push(`size: ${size(before)} → ${size(after)}`)
  for (const k of Object.keys(after.values)) {
    if (before.values[k] !== after.values[k]) out.push(`${k}: ${before.values[k] || 'none'} → ${after.values[k]}`)
  }
  return out
}

const SKIP_LINK = /(log|sign)[-_]?out|\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|csv|xml|json)$/i

/** A page address without its fragment, or '' when it is not http or https. */
export function pageOf(href, base) {
  try {
    const u = new URL(href, base)
    u.hash = ''
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}

/** The links of a page that the driver may follow: same origin, not seen, not a sign-out link, not a file. */
export function linksFrom(hrefs, origin, seen) {
  const out = []
  for (const href of hrefs) {
    const page = pageOf(href)
    if (!page || new URL(page).origin !== origin || seen.has(page) || out.includes(page) || SKIP_LINK.test(new URL(page).pathname)) continue
    out.push(page)
  }
  return out
}

export function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    if (spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0) return name
  }
  return null
}

const fail = (code, message) => Object.assign(new Error(message), { code })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- these three run in the page ----------

function measureInPage(selector, props) {
  var el = document.querySelector(selector)
  if (!el) return null
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  var r = el.getBoundingClientRect()
  var cs = getComputedStyle(el)
  var values = {}
  for (var i = 0; i < props.length; i++) values[props[i]] = cs.getPropertyValue(props[i])
  var root = document.documentElement
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height, pageWidth: root.scrollWidth, pageHeight: root.scrollHeight, values: values }
}

// Sets the declarations through the style object, which a content security policy does not hold, and keeps the old values.
function patchInPage(selector, decl) {
  var el = document.querySelector(selector)
  if (!el) return false
  var old = {}
  for (var k in decl) {
    old[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]
    el.style.setProperty(k, decl[k], 'important')
  }
  window.__restylePatch = { el: el, old: old, hadStyle: el.hasAttribute('style') }
  return true
}

// Puts the old values back. True when the element's own style is as it was.
function unpatchInPage() {
  var p = window.__restylePatch
  if (!p) return false
  delete window.__restylePatch
  var same = true
  for (var k in p.old) {
    if (p.old[k][0]) p.el.style.setProperty(k, p.old[k][0], p.old[k][1])
    else p.el.style.removeProperty(k)
    if (p.el.style.getPropertyValue(k) !== p.old[k][0]) same = false
  }
  if (!p.hadStyle) p.el.removeAttribute('style')
  return same && p.el.hasAttribute('style') === p.hadStyle
}

// ---------- Chrome and the DevTools Protocol ----------

async function startChrome(chrome) {
  const profile = mkdtempSync(join(tmpdir(), 'restyle-chrome-'))
  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-extensions', '--hide-scrollbars', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const stop = () => {
    proc.kill('SIGKILL')
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
  }
  let stderr = ''
  const ws = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 20000)
    const done = (v) => (clearTimeout(timer), resolve(v))
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (c) => {
      if (stderr.length < 8000) stderr += c // Chrome can log for the whole run: keep the start, where the address is
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)
      if (m) done(m[1])
    })
    proc.on('error', () => done(null))
    proc.on('exit', () => done(null))
  })
  if (!ws) {
    stop()
    throw fail('CHROME_START', `Chrome did not start: ${stderr.trim().split('\n').pop() || 'no output'}`)
  }
  return { ws, stop }
}

// One socket to the browser. `send` resolves with a command's result; `once` with the next event of that name.
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(fail('CHROME_START', 'Cannot connect to Chrome.'))
  })
  let id = 0
  const calls = new Map()
  const waits = new Set()
  const handlers = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id) {
      const call = calls.get(msg.id)
      calls.delete(msg.id)
      if (call) msg.error ? call.reject(new Error(`${call.method}: ${msg.error.message}`)) : call.resolve(msg.result)
      return
    }
    handlers.get(msg.method)?.(msg)
    for (const w of waits) if (w.method === msg.method) (waits.delete(w), w.resolve(msg.params))
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      calls.set(++id, { method, resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  const once = (method, ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => (waits.delete(w), resolve(null)), ms)
      const w = { method, resolve: (v) => (clearTimeout(timer), resolve(v)) }
      waits.add(w)
    })
  return { send, once, on: (method, fn) => handlers.set(method, fn), close: () => ws.close() }
}

/**
 * Audits the pages and returns the board: one card for each finding, with a before crop and, where a CSS patch can
 * show the fix, an after crop.
 * @param urls the pages to start from (http or https). The origin where the first page lands is the app.
 * @param opts `{ pages, widths, dismissed, settleMs, chrome, onProgress }`: `pages` is the page limit (5);
 *             `dismissed` holds, for each origin, the list of `{ rule, selector }` that the audit leaves out
 */
export async function auditUrl(urls, opts = {}) {
  const start = urls.map((u) => pageOf(u)).filter(Boolean)
  if (!start.length) throw fail('BAD_URL', 'Give an http or https URL.')
  let origin = ''
  let dismissed = []
  const limit = Math.max(1, Math.min(Number(opts.pages) || 5, 50))
  const widths = opts.widths || WIDTHS
  const say = opts.onProgress || (() => {})
  const chromePath = opts.chrome || findChrome()
  if (!chromePath) throw fail('NO_CHROME', 'No Chrome or Chromium found. Set CHROME_PATH.')
  const picker = readFileSync(new URL('picker.js', import.meta.url), 'utf8')

  const chrome = await startChrome(chromePath)
  let cdp
  try {
    cdp = await connect(chrome.ws)
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const page = (method, params) => cdp.send(method, params, sessionId)
    // A value from the page, by JSON, so the page cannot hand over an object.
    const evaluate = async (expression) => {
      const r = await page('Runtime.evaluate', { expression: `JSON.stringify(${expression})`, returnByValue: true })
      if (r.exceptionDetails || typeof r.result.value !== 'string') return undefined
      try {
        return JSON.parse(r.result.value)
      } catch {
        return undefined
      }
    }
    const inPage = (fn, ...args) => evaluate(`(${fn})(${args.map((a) => JSON.stringify(a)).join(',')})`)
    await page('Page.enable')
    // Read what the browser gives each tag with no stylesheet: a live copy states what differs. The empty page has a
    // doctype, as the copy's own document has: about:blank is in quirks mode, where an input is a border box.
    const empty = cdp.once('Page.loadEventFired', 10000)
    await page('Page.navigate', { url: 'data:text/html,<!doctype html><html><body></body></html>' })
    await empty
    const defaults = (await inPage(defaultsInPage, HTML_TAGS, SVG_TAGS)) || {}
    const recipes = opts.recipes || loadRecipes()
    const used = {}
    // A dialog would hold the page: close it.
    cdp.on('Page.javascriptDialogOpening', () => void page('Page.handleJavaScriptDialog', { accept: false }).catch(() => {}))

    const shot = async (box) => {
      const clip = box && clipFor(box)
      if (!clip) return undefined
      await sleep(150) // lazy images and the scroll settle
      const { data } = await page('Page.captureScreenshot', { format: 'webp', quality: 80, clip: { ...clip, scale: 1 }, captureBeyondViewport: true })
      return `data:image/webp;base64,${data}`
    }

    const cards = new Map()
    const seen = new Set()
    const visited = []
    const queue = [...start]
    while (queue.length && visited.length < limit) {
      const url = queue.shift()
      if (seen.has(url)) continue
      seen.add(url)
      let here = ''
      for (const width of widths) {
        say(`Page ${visited.length + (here ? 0 : 1)} of at most ${limit}, ${width} px: ${url}`)
        await page('Emulation.setDeviceMetricsOverride', { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 2, mobile: false })
        const loaded = cdp.once('Page.loadEventFired', 30000)
        const nav = await page('Page.navigate', { url })
        if (nav.errorText) {
          say(`Left out, the page did not load (${String(nav.errorText).slice(0, 80)}): ${url}`)
          break
        }
        await loaded
        await sleep(opts.settleMs ?? 800)
        await page('Runtime.evaluate', { expression: picker })
        const audit = await evaluate('window.__restyle && window.__restyle.audit()')
        const landed = pageOf(audit?.url || '')
        if (!audit || !landed) break
        if (!origin) {
          origin = new URL(landed).origin
          const list = opts.dismissed && Object.hasOwn(opts.dismissed, origin) ? opts.dismissed[origin] : []
          dismissed = Array.isArray(list) ? list.filter((d) => d && typeof d.rule === 'string' && typeof d.selector === 'string') : []
        }
        // A redirect to another origin, for example to a sign-in service: not this app. A redirect to a page that
        // the audit already has: not again.
        if (new URL(landed).origin !== origin || (!here && visited.includes(landed))) break
        if (!here) {
          here = landed
          seen.add(landed)
          visited.push(landed)
          queue.push(...linksFrom((await evaluate('Array.prototype.map.call(document.querySelectorAll("a[href]"), function (a) { return a.href })')) || [], origin, seen))
        }
        const findings = keep(cleanFindings(audit.findings).filter((f) => signOf(f.rule)), dismissed)
        for (const f of findings) {
          const key = `${here}\n${f.rule}\n${f.pick.selector}`
          const known = cards.get(key)
          if (known) {
            known.widths.push(width)
            continue
          }
          const sign = signOf(f.rule)
          const card = {
            id: `c${cards.size + 1}`, rule: f.rule, name: sign.name, tier: sign.craft ? 'craft' : 'generic', page: here, widths: [width],
            detail: f.detail, fix: sign.fix, changed: [], pick: f.pick,
          }
          cards.set(key, card)
          const decl = patchFor(f)
          const props = decl ? Object.keys(decl) : []
          const before = await inPage(measureInPage, f.pick.selector, props)
          card.before = await shot(before)
          // The live copy of the element, and the recipes that the board can put on it.
          const capsule = capsuleOf(await inPage(copyInPage, f.pick.selector, CAPSULE_NODES), defaults)
          if (capsule.skipped) card.noCapsule = capsule.skipped
          else {
            card.capsule = capsule
            // The recipe that fixes this finding leads the shelf, and the board marks it.
            const fixId = signOf(f.rule)?.recipe
            const fits = shelf(recipes, f.pick, fixId)
            if (fixId && fits.fit.some((r) => `${r.category}/${r.slug}` === fixId)) card.fixId = fixId
            card.shelf = fits.fit.map((r) => `${r.category}/${r.slug}`)
            card.more = fits.more.map((r) => r.name)
            for (const r of fits.fit) used[`${r.category}/${r.slug}`] = { name: r.name, category: r.category, patch: r.patch }
          }
          if (!decl || !card.before || !(await inPage(patchInPage, f.pick.selector, decl))) continue
          const after = await inPage(measureInPage, f.pick.selector, props)
          const image = await shot(after)
          if (!(await inPage(unpatchInPage))) throw fail('PATCH', `The patch for ${f.rule} did not come off ${f.pick.selector}.`)
          card.changed = after ? changes(before, after) : []
          if (image && image !== card.before) card.after = image
          else card.changed.push('The patch changes nothing that shows at this width.')
        }
      }
    }
    if (!visited.length) throw fail('NO_PAGE', `The page did not load, or it went to another origin: ${start[0]}`)
    return { version: 1, origin, made: new Date().toISOString(), pages: visited, widths, recipes: used, cards: [...cards.values()] }
  } finally {
    cdp?.close()
    chrome.stop()
  }
}

/** Writes the board file whole: a reader never sees half a file. */
export function writeBoard(file, board) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(`${file}.tmp`, JSON.stringify(board), { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

// ---------- command line ----------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const emit = (line) => process.stdout.write(JSON.stringify(line) + '\n')
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(name)
    return i < 0 ? undefined : args.splice(i, 2)[1]
  }
  const pages = flag('--pages')
  const out = flag('--out') || join(tmpdir(), 'restyle-board', 'board.json')
  // RESTYLE_DISMISSED: JSON, `{ "<origin>": [{ "rule": …, "selector": … }] }`. The mod sets it from its stored decisions.
  let dismissed = {}
  try {
    const map = JSON.parse(process.env.RESTYLE_DISMISSED || '{}')
    if (map && typeof map === 'object') dismissed = map
  } catch {}
  try {
    const board = await auditUrl(args, { pages, dismissed, onProgress: (text) => emit({ type: 'progress', text }) })
    writeBoard(out, board)
    emit({ type: 'progress', text: `Board: ${board.cards.length} cards from ${board.pages.length} pages. Data: ${out}` })
    emit({ type: 'board', cards: board.cards.map((c) => ({ id: c.id, page: c.page, widths: c.widths, finding: { rule: c.rule, detail: c.detail, pick: c.pick } })) })
  } catch (err) {
    emit({ type: 'error', text: String(err?.message || err).slice(0, 300) })
    process.exitCode = 1
  }
}
