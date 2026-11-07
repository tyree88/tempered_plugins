// Test and check runs read from Bash commands and their results. No exit code reaches a hook, so the status is
// direct only when nothing, or only `&&`-chained segments, follow the runner; otherwise stdout is read for a summary.
export type RunKind = 'test' | 'check'
export type Detected = { kind: RunKind; runner: string; ok: boolean | null }

const ENV = /^((\w+=\S+|time|env)\s+)*/
const PREFIX = /^(npx\s+|pnpm\s+((exec|run|-r|--filter\s+\S+)\s+)?|yarn\s+(run\s+)?|bunx?\s+|python3?\s+-m\s+|uv\s+run\s+|poetry\s+run\s+)?/
const PM_TEST = /^(npm|pnpm|yarn)\s+(t\b|((run|-r|--filter\s+\S+)\s+)?test(:\S+)?\b)/
const TEST = /^(vitest|jest|mocha|pytest|cargo\s+test|go\s+test|bun\s+test|node\s+--test|claude\s+plugin\s+test)\b/
const CHECK = /^(tsc|eslint|cargo\s+(check|build)|npm\s+run\s+(check|build|lint)|pnpm\s+(check|build|lint)|claude\s+plugin\s+validate)\b/
const READ_VERBS = /^(grep|rg|find|ls|cat|head|tail|sed|awk)\b/

// Pipeline segments with the separator that follows each. shortcut: quotes are not parsed, so a `&&` inside a
// string splits; upgrade if a real command misreads.
const segments = (command: string) => {
  const out: { text: string; sep: string }[] = []
  const re = /(\|\||&&|;|\||\n)/g
  let last = 0
  for (const m of command.matchAll(re)) {
    out.push({ text: command.slice(last, m.index).trim(), sep: m[0] === '\n' ? ';' : m[0] })
    last = m.index + m[0].length
  }
  out.push({ text: command.slice(last).trim(), sep: '' })
  return out.filter(s => s.text)
}

const runnerOf = (segment: string): { kind: RunKind; runner: string } | undefined => {
  const bare = segment.replace(ENV, '')
  const pm = bare.match(PM_TEST)
  if (pm) return { kind: 'test', runner: pm[0] }
  const cmd = bare.replace(PREFIX, '')
  const t = cmd.match(TEST)
  if (t) return { kind: 'test', runner: t[0] }
  const c = cmd.match(CHECK)
  if (c) return { kind: 'check', runner: c[0] }
  return undefined
}

const SUMMARY: { re: RegExp; ok: boolean }[] = [
  { re: /Tests\s+[1-9]\d* failed|Test Files\s+[1-9]\d* failed/, ok: false },
  { re: /test result: FAILED/, ok: false },
  { re: /^FAIL\b/m, ok: false },
  { re: /\b[1-9]\d* failed\b/, ok: false },
  { re: /test result: ok/, ok: true },
  { re: /^ok\b/m, ok: true },
  { re: /\b\d+ passed\b/, ok: true },
]

export const summaryOutcome = (output: string): boolean | null => SUMMARY.find(s => s.re.test(output))?.ok ?? null

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

// The run a command made, when it made one: the first segment whose command is a runner. `output` is stdout + stderr.
export function detectRun(command: string, result: { isError: boolean; interrupted?: boolean; output: string }): Detected | undefined {
  if (result.interrupted) return undefined
  const segs = segments(command)
  const i = segs.findIndex(s => runnerOf(s.text))
  if (i < 0) return undefined
  const found = runnerOf(segs[i]!.text)!
  const runner = clip(found.runner.replace(/\s+/g, ' '), 12)
  const after = segs.slice(i).map(s => s.sep).filter(Boolean)
  const pipefail = /set\s+-o\s+pipefail/.test(command)
  const direct = after.every(sep => sep === '&&' || (pipefail && sep === '|'))
  if (direct) return { kind: found.kind, runner, ok: !result.isError }
  if (found.kind === 'check') return { kind: 'check', runner, ok: !result.isError } // shortcut: no summary regexes for checkers; upgrade when one misreads
  return { kind: 'test', runner, ok: summaryOutcome(result.output) }
}

// A shell command that only reads: its first word, after `cd … &&` and env prefixes, is a read verb.
export const isReadCommand = (command: string) => {
  const first = segments(command).find(s => !/^cd\s/.test(s.text))
  return !!first && READ_VERBS.test(first.text.replace(ENV, ''))
}

// Paths a `git checkout` or `git restore` names: changes on them are reverts.
export function revertedPaths(command: string): string[] {
  const out: string[] = []
  for (const s of segments(command)) {
    const m = s.text.match(/^git\s+(?:-C\s+\S+\s+)?(checkout|restore)\b(.*)$/)
    if (!m) continue
    for (const tok of (m[2] ?? '').trim().split(/\s+/)) if (tok && !tok.startsWith('-')) out.push(tok)
  }
  return out
}

// The target shown as an agent's last action: the command after a leading `cd … &&`, cut to 24.
export const bashTarget = (command: string) => clip(command.replace(/^\s*cd\s+[^&;|]+&&\s*/, '').replace(/\s+/g, ' ').trim(), 24)
