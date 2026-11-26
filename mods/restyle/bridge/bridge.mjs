// restyle bridge: serves picker.js to the dev page and prints each pick and each audit as one JSON line (plan contract C2).
// It also serves the board (board.html and its data file) and prints each verdict that the board posts.
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanFindings, cleanPick, str } from './clean.mjs'

const LIMIT = 16384
const AUDIT_LIMIT = 4 * LIMIT // an audit carries up to 24 picks
const token = process.env.RESTYLE_TOKEN || randomBytes(16).toString('hex')
const pickerPath = new URL('picker.js', import.meta.url)
const boardPage = new URL('board.html', import.meta.url)
// The board's data: the driver (audit-url.mjs) writes it. Without RESTYLE_BOARD the bridge names a file once it has a port.
let boardFile = process.env.RESTYLE_BOARD || ''
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const emit = (line) => process.stdout.write(JSON.stringify(line) + '\n')

// Text that a person typed on the board: one line, no control characters, at most 500 characters.
const typed = (v) => str(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 500)

// One verdict at a time: each reads the board file, marks its card and writes the file back.
let saving = Promise.resolve()
function saveVerdict(body) {
  const run = saving.then(async () => {
    const verdict = body.verdict === 'accept' || body.verdict === 'dismiss' ? body.verdict : null
    const reason = verdict === 'dismiss' ? typed(body.reason) : ''
    if (!verdict || typeof body.id !== 'string' || (verdict === 'dismiss' && !reason)) return 400
    let board
    try {
      board = JSON.parse(await readFile(boardFile, 'utf8'))
    } catch {
      return 404
    }
    // The card comes from the file. The post names it by id and adds nothing else to it.
    const card = Array.isArray(board?.cards) ? board.cards.find((c) => c && c.id === body.id) : undefined
    if (!card) return 404
    // The recipes picked for the variant: only ids from the card's own shelf in the file, 8 at most. A dismiss has none.
    const onShelf = Array.isArray(card.shelf) ? card.shelf : []
    const picks = verdict === 'accept' && Array.isArray(body.picks) ? [...new Set(body.picks.filter((p) => typeof p === 'string' && onShelf.includes(p)))].slice(0, 8) : []
    card.verdict = { verdict, reason, comment: typed(body.comment), at: new Date().toISOString(), ...(picks.length ? { picks } : {}) }
    await writeFile(`${boardFile}.tmp`, JSON.stringify(board), { mode: 0o600 })
    await rename(`${boardFile}.tmp`, boardFile)
    emit({ type: 'verdict', id: card.id, ...card.verdict })
    return 204
  })
  saving = run.catch(() => {})
  return run
}

function send(res, status, headers = {}, body) {
  res.writeHead(status, { ...cors, ...headers })
  res.end(body)
}

// Resolves to the parsed body, or to a status number on failure.
function readJson(req, res, limit) {
  return new Promise((resolve) => {
    const tooBig = () => {
      // Stop reading: answer, then drop the connection.
      res.on('finish', () => req.destroy())
      resolve(413)
    }
    if (Number(req.headers['content-length']) > limit) return tooBig()
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (c) => {
      if (done) return
      size += c.length
      if (size > limit) {
        done = true
        req.pause()
        return tooBig()
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (done) return
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : 400)
      } catch {
        resolve(400)
      }
    })
    req.on('error', () => resolve(400))
  })
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204)
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.searchParams.get('t') !== token) return send(res, 403, { connection: 'close' })

    if (req.method === 'GET' && url.pathname === '/picker.js') {
      let file
      try {
        file = await readFile(pickerPath)
      } catch {
        process.stderr.write('restyle bridge: picker.js not found\n')
        return send(res, 404)
      }
      return send(res, 200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }, file)
    }

    if (req.method === 'GET' && url.pathname === '/board') {
      // The page shows data from the audited app. Its policy lets it run its own script, show data: images and call the bridge.
      const nonce = randomBytes(16).toString('base64')
      const page = (await readFile(boardPage, 'utf8')).replaceAll('__NONCE__', nonce)
      const policy = `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      return send(res, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': policy }, page)
    }
    if (req.method === 'GET' && url.pathname === '/board.json') {
      let file
      try {
        file = await readFile(boardFile)
      } catch {
        return send(res, 404)
      }
      return send(res, 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, file)
    }

    const route = req.method === 'POST' && ['/hello', '/pick', '/audit', '/verdict'].includes(url.pathname) ? url.pathname : null
    if (!route) return send(res, 404)

    const body = await readJson(req, res, route === '/audit' ? AUDIT_LIMIT : LIMIT)
    if (typeof body === 'number') return send(res, body, body === 413 ? { connection: 'close' } : {})

    if (route === '/hello') {
      emit({ type: 'hello', url: str(body.url) })
      return send(res, 204)
    }
    if (route === '/audit') {
      emit({ type: 'audit', url: str(body.url), findings: cleanFindings(body.findings) })
      return send(res, 204)
    }
    if (route === '/verdict') return send(res, await saveVerdict(body))
    if (typeof body.tag !== 'string' || typeof body.selector !== 'string') return send(res, 400)
    emit({ type: 'pick', pick: cleanPick(body) })
    return send(res, 204)
  } catch (err) {
    process.stderr.write(`restyle bridge: ${err?.stack || err}\n`)
    if (!res.headersSent) send(res, 500)
  }
})

// RESTYLE_PORT asks for the same port as last time, so a script tag already in a dev layout keeps working.
let wantPort = Number(process.env.RESTYLE_PORT) || 0
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && wantPort) {
    // Another session holds it: take any free port; the pane shows the tag for this one.
    wantPort = 0
    server.listen(0, '127.0.0.1')
    return
  }
  process.stderr.write(`restyle bridge: cannot listen: ${err.message}\n`)
  process.exit(1)
})
server.on('listening', () => {
  const port = server.address().port
  // One file for each port, so two sessions do not share a board. The folder is the user's own temporary folder.
  boardFile ||= join(tmpdir(), `restyle-${port}`, 'board.json')
  emit({ type: 'ready', port, token, board: boardFile })
})
server.listen(wantPort, '127.0.0.1')

const quit = () => process.exit(0)
process.on('SIGTERM', quit)
process.stdin.on('end', quit)
process.stdin.on('close', quit)
process.stdin.resume()
