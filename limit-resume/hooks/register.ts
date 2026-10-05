import type { EngineInterface as Engine, Register } from 'claude-code'

type Kind = 'limit' | 'transient' | 'fatal' | null
type Window = { kind: string; percentUsed: number; resetsAt?: string }
type Timer = { cancel: () => void }

const MIN = 60_000
const MAX_TRIES = 12
const WARN_AT = 85
const RESUME =
  'The rate limit / API error that stopped the last turn has cleared. Continue from where you left off.'

// What ended the turn. null = a normal answer.
export function classify(reason: string, answer: string, windows: Window[]): Kind {
  const text = answer.trim()
  const isError =
    reason === 'error' || (text.length < 400 && /^(you've hit your|api error)/i.test(text))
  if (!isError) return null
  if (/prompt is too long|context (window|limit)|maximum context/i.test(text)) return 'fatal'
  if (/hit your .*limit|usage limit|rate.?limit|\b429\b/i.test(text)) return 'limit'
  if (windows.some(w => w.percentUsed >= 100)) return 'limit'
  return 'transient' // 529 overloaded, 5xx, dropped connection, machine slept
}

// How long to wait before the next resume. Limits wait for the exceeded window(s) to reset.
export function delayMs(kind: 'limit' | 'transient', attempt: number, windows: Window[], now: number): number {
  if (kind === 'transient') return Math.min(MIN * 2 ** attempt, 15 * MIN)
  const future = windows.filter(w => w.resetsAt && Date.parse(w.resetsAt) > now)
  const over = future.filter(w => w.percentUsed >= 100)
  const pick = over.length ? over : future.sort((a, b) => b.percentUsed - a.percentUsed).slice(0, 1)
  if (!pick.length) return 30 * MIN
  return Math.max(...pick.map(w => Date.parse(w.resetsAt!))) - now + MIN
}

export const fmt = (ms: number) => {
  const m = Math.max(1, Math.round(ms / MIN))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

const usageLine = (ws: Window[]) =>
  ws
    .map(w => `${w.kind === 'five_hour' ? '5h' : w.kind === 'seven_day' ? '7d' : w.kind} ${Math.round(w.percentUsed)}%`)
    .join(' · ')

export const register: Register = on => {
  let host: Engine | undefined
  let timer: Timer | undefined
  let tick: Timer | undefined
  let attempt = 0
  let warned = ''

  const stop = () => {
    timer?.cancel()
    tick?.cancel()
    timer = tick = undefined
  }

  const showUsage = async ($: Engine) => {
    const { rateLimits } = await $.session.usage()
    if (!timer) $.ui.status(rateLimits.length ? usageLine(rateLimits) : undefined)
    const five = rateLimits.find(w => w.kind === 'five_hour')
    if (five && five.percentUsed >= WARN_AT && five.percentUsed < 100 && warned !== five.resetsAt) {
      warned = five.resetsAt ?? 'seen'
      $.ui.toast(`5h window ${Math.round(five.percentUsed)}% used. Good moment to commit a checkpoint.`, {
        timeoutMs: 10_000,
      })
    }
    return rateLimits
  }

  on('session.start', async ($, e, next) => {
    host = $
    await $.command.register({
      name: 'autoresume',
      description: 'limit-resume: turn auto-resume after rate limits on or off',
      argumentHint: 'on | off | status',
    })
    void showUsage($)
    return next(e)
  })

  on('command.run', { command: 'autoresume' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') await $.store.set('enabled', arg === 'on')
    if (arg === 'off') stop()
    const isOn = (await $.store.get('enabled')) !== false
    await showUsage($)
    return { text: `limit-resume is ${isOn ? 'on' : 'off'}${timer ? '; a resume is scheduled' : ''}.` }
  })

  // You typed something while a resume was pending: you took over.
  on('prompt.submit', ($, e, next) => {
    if (timer && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      stop()
      void showUsage($)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.isAborted) return result

    const windows = await showUsage($)
    const kind = classify(e.reason, e.answer, windows)
    if (!kind) {
      attempt = 0
      return result
    }
    if (kind === 'fatal') {
      $.ui.toast('limit-resume: context limit hit. Not auto-resuming; /compact first.')
      return result
    }
    if ((await $.store.get('enabled')) === false) return result
    if (attempt >= MAX_TRIES) {
      $.ui.toast(`limit-resume: gave up after ${MAX_TRIES} tries.`)
      attempt = 0
      return result
    }

    const runner = host ?? $
    const now = await $.clock.now()
    const wait = delayMs(kind, attempt++, windows, now)
    const due = now + wait
    const label = kind === 'limit' ? 'Rate limit' : 'API error'
    const paint = async () =>
      runner.ui.status(`⏸ ${label}: auto-resume in ${fmt(due - (await runner.clock.now()))} · /autoresume off cancels`)

    stop()
    timer = runner.clock.after(wait, () => {
      stop()
      runner.ui.status('▶ limit-resume: resuming…')
      void runner.prompt.submit({ text: RESUME })
    })
    tick = runner.clock.every(MIN, () => void paint())
    await paint()
    $.ui.toast(`limit-resume: ${label.toLowerCase()}. Resuming in ${fmt(wait)}.`, { timeoutMs: 8000 })
    return result
  })
}
