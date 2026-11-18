// restyle bridge: serves picker.js to the dev page and prints each pick as one JSON line (plan contract C2).
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const LIMIT = 16384
const token = process.env.RESTYLE_TOKEN || randomBytes(16).toString('hex')
const pickerPath = new URL('picker.js', import.meta.url)
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const emit = (line) => process.stdout.write(JSON.stringify(line) + '\n')
const str = (v) => (typeof v === 'string' ? v : '')
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// Copy only the Pick fields in types/index.d.ts, so a page cannot add fields.
function cleanPick(b) {
  const pick = {
    url: str(b.url),
    tag: b.tag,
    selector: b.selector,
    text: str(b.text).slice(0, 200),
    size: { width: num(b.size?.width), height: num(b.size?.height) },
    styles: {},
  }
  if (typeof b.role === 'string') pick.role = b.role
  if (b.styles && typeof b.styles === 'object') {
    for (const [k, v] of Object.entries(b.styles)) if (typeof v === 'string') pick.styles[k] = v
  }
  if (typeof b.component === 'string') pick.component = b.component
  if (b.source && typeof b.source.file === 'string' && typeof b.source.line === 'number') {
    pick.source = { file: b.source.file, line: b.source.line }
  }
  return pick
}

function send(res, status, headers = {}, body) {
  res.writeHead(status, { ...cors, ...headers })
  res.end(body)
}

// Resolves to the parsed body, or to a status number on failure.
function readJson(req, res) {
  return new Promise((resolve) => {
    const tooBig = () => {
      // Stop reading: answer, then drop the connection.
      res.on('finish', () => req.destroy())
      resolve(413)
    }
    if (Number(req.headers['content-length']) > LIMIT) return tooBig()
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (c) => {
      if (done) return
      size += c.length
      if (size > LIMIT) {
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

    const route = req.method === 'POST' && (url.pathname === '/hello' || url.pathname === '/pick') ? url.pathname : null
    if (!route) return send(res, 404)

    const body = await readJson(req, res)
    if (typeof body === 'number') return send(res, body, body === 413 ? { connection: 'close' } : {})

    if (route === '/hello') {
      emit({ type: 'hello', url: str(body.url) })
      return send(res, 204)
    }
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
server.on('listening', () => emit({ type: 'ready', port: server.address().port, token }))
server.listen(wantPort, '127.0.0.1')

const quit = () => process.exit(0)
process.on('SIGTERM', quit)
process.stdin.on('end', quit)
process.stdin.on('close', quit)
process.stdin.resume()
