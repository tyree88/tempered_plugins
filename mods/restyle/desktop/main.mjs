// restyle desktop: the Electron main process. It owns the files, the audit driver and the clipboard.
// The window is a sandboxed page with no Node. It reaches this process only through the calls in preload.cjs.
import { app, BrowserWindow, clipboard, ipcMain, protocol } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCore } from './core.mjs'

const ORIGIN = 'app://restyle'
// The only files the window can load. A fixed list: no path from the page reaches the disk.
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
}
const SMOKE = process.env.RESTYLE_SMOKE === '1'

// A second copy of the app keeps its files apart. A smoke run never touches the real files.
const dataDir = SMOKE ? mkdtempSync(join(tmpdir(), 'restyle-smoke-')) : process.env.RESTYLE_DATA_DIR
if (dataDir) app.setPath('userData', dataDir)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }])

// The audit in progress. The app waits for it before it quits: the driver stops its Chrome when it ends.
let busy = null
app.on('before-quit', (e) => {
  if (!busy) return
  e.preventDefault()
  busy.catch(() => {}).finally(() => app.quit())
})
app.on('window-all-closed', () => app.quit())

app.whenReady().then(() => {
  const core = createCore({ dir: app.getPath('userData') })

  protocol.handle('app', async (req) => {
    const url = new URL(req.url)
    const file = url.host === 'restyle' && Object.hasOwn(FILES, url.pathname) ? FILES[url.pathname] : null
    if (!file) return new Response('', { status: 404 })
    let body = await readFile(new URL(`renderer/${file[0]}`, import.meta.url), 'utf8')
    const headers = { 'content-type': file[1], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    if (file[0] === 'index.html') {
      // The window shows data from audited pages. Its policy lets it run its one script, load its one stylesheet, show
      // data: images, and style the live copies (a frame made from `srcdoc` is under this policy: its styles carry the nonce).
      const nonce = randomBytes(16).toString('base64')
      body = body.replaceAll('__NONCE__', nonce)
      headers['content-security-policy'] = `default-src 'none'; img-src data:; style-src 'self' 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    }
    return new Response(body, { headers })
  })

  // Only the app's own page, in the window's main frame, may call.
  const handle = (name, fn) =>
    ipcMain.handle(name, (e, ...args) => {
      if (e.senderFrame !== e.sender.mainFrame || !e.senderFrame?.url.startsWith(`${ORIGIN}/`)) throw new Error('Refused.')
      return fn(e, ...args)
    })
  handle('state', () => ({ board: core.board(), catalog: core.catalog() }))
  handle('run', async (e, url, pages) => {
    // shortcut: the driver starts the Chrome or Chromium installed on this machine. Drive a hidden BrowserWindow over
    // `webContents.debugger` when the app must run with no browser installed, or must audit signed-in pages.
    busy = core.run(url, pages, (text) => {
      if (!e.sender.isDestroyed()) e.sender.send('progress', String(text).slice(0, 300))
    })
    try {
      return await busy
    } finally {
      busy = null
    }
  })
  handle('verdict', (_e, body) => core.verdict(body))
  handle('prompt', (_e, id) => core.prompt(id))
  handle('copy', (_e, text) => clipboard.writeText(String(text).slice(0, 400000)))

  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 560, title: 'Restyle', show: !SMOKE,
    webPreferences: { preload: fileURLToPath(new URL('preload.cjs', import.meta.url)), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  // The window stays on its own page and opens no other window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.loadURL(`${ORIGIN}/`)
  if (SMOKE) win.webContents.once('did-finish-load', () => smoke(win))
})

// `npm run smoke`: loads the window without showing it, prints one line of what it finds, and quits.
// With RESTYLE_SMOKE_URL it also audits that address through the window's own form, accepts the first finding and
// opens the queue. With RESTYLE_SMOKE_SHOT it writes a PNG of the board to that file.
async function smoke(win) {
  const url = process.env.RESTYLE_SMOKE_URL || ''
  let report
  try {
    report = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const inline = document.createElement('script')
      inline.textContent = 'window.__inline = 1'
      document.head.appendChild(inline)
      await wait(400)
      const url = ${JSON.stringify(url)}
      if (url) {
        document.getElementById('url').value = url
        document.getElementById('pages').value = 1
        document.getElementById('run').requestSubmit()
        await wait(200)
        for (let i = 0; i < 600 && document.getElementById('go').disabled; i++) await wait(200)
        await wait(500) // the frames of the live copy load
      }
      return {
        url,
        title: document.title,
        api: typeof window.restyle,
        nodeInPage: typeof window.require + ' ' + typeof window.process,
        inlineScriptRan: window.__inline === 1,
        styled: getComputedStyle(document.querySelector('.win')).display === 'grid',
        catalog: document.getElementById('n-catalog').textContent,
        cards: document.querySelectorAll('#list .row').length,
        frames: document.querySelectorAll('#detail iframe').length,
        crops: document.querySelectorAll('#detail img').length,
        say: document.getElementById('say').textContent,
      }
    })()`)
    if (process.env.RESTYLE_SMOKE_SHOT) writeFileSync(process.env.RESTYLE_SMOKE_SHOT, (await win.webContents.capturePage()).toPNG())
    if (report.cards) {
      Object.assign(report, await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        document.querySelector('[data-act="accept"]').click()
        await wait(400)
        document.querySelector('[data-view="queue"]').click()
        await wait(400)
        return { queued: document.querySelectorAll('.q-item').length, promptChars: (document.querySelector('.q-item pre') || {}).textContent?.length || 0 }
      })()`))
    }
  } catch (err) {
    report = { error: String(err?.message || err) }
  }
  console.log('SMOKE ' + JSON.stringify({ electron: process.versions.electron, node: process.versions.node, ...report }))
  rmSync(dataDir, { recursive: true, force: true })
  app.exit(report.error ? 1 : 0)
}
