import type { Checks, Snap } from '../types'

export type Run = { name: string; status: string; conclusion: string | null; started_at?: string | null }
export type Status = { context: string; state: string }
export type Seg = { text: string; tone: 'dim' | 'ok' | 'warn' | 'bad' }

const FAIL = new Set(['failure', 'timed_out', 'action_required', 'error'])
const WAIT = new Set(['pending', 'queued', 'in_progress'])

// Last `cd <dir>` in a shell command, resolved against base; undefined when there is none.
export function lastCd(command: string, base: string): string | undefined {
  const all = [...command.matchAll(/(?:^|&&|;|\|\||\n)\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g)]
  const m = all.at(-1)
  const p = m && (m[1] ?? m[2] ?? m[3])
  if (!p || /^[~$-]/.test(p)) return undefined
  return p.startsWith('/') ? p : `${base}/${p}`
}

// One verdict per check name: the newest non-skipped run wins; commit statuses are already latest per context.
export function summarize(runs: Run[], statuses: Status[]): Checks {
  const verdict = new Map<string, string>()
  const live = runs
    .filter(r => r.conclusion !== 'skipped' && r.conclusion !== 'neutral')
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
  for (const r of live) {
    if (!verdict.has(r.name)) verdict.set(r.name, r.status === 'completed' ? (r.conclusion ?? 'neutral') : 'pending')
  }
  for (const s of statuses) if (!verdict.has(s.context)) verdict.set(s.context, s.state)
  const all = [...verdict]
  return {
    total: all.length,
    pending: all.filter(([, v]) => WAIT.has(v)).length,
    failed: all.filter(([, v]) => FAIL.has(v)).map(([n]) => n),
  }
}

export const isPending = (s: Snap | null) =>
  !!s && ((s.ci?.pending ?? 0) > 0 || WAIT.has(s.prod?.state ?? ''))

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

export function segments(s: Snap, now: number): Seg[] {
  const segs: Seg[] = [{ text: `${s.dir.split('/').at(-1)} ⎇ ${s.branch}`, tone: 'dim' }]
  segs.push(s.dirty ? { text: `${s.dirty} dirty`, tone: 'warn' } : { text: 'clean', tone: 'dim' })
  if (s.ahead === null) segs.push({ text: 'no upstream', tone: 'warn' })
  else segs.push({ text: `↑${s.ahead} ↓${s.behind}`, tone: s.ahead || s.behind ? 'warn' : 'dim' })
  if (s.pr) segs.push({ text: `PR #${s.pr.number}${s.pr.state === 'OPEN' ? '' : ` ${s.pr.state.toLowerCase()}`}`, tone: 'dim' })
  if (s.ci?.total) {
    const at = s.ci.sha === s.head ? '' : ` @${s.ci.sha.slice(0, 7)}`
    if (s.ci.failed.length) segs.push({ text: `CI ✗ ${s.ci.failed.join(', ')}${at}`, tone: 'bad' })
    else if (s.ci.pending) segs.push({ text: `CI ⏳ ${s.ci.total - s.ci.pending}/${s.ci.total}${at}`, tone: 'warn' })
    else segs.push({ text: `CI ✓ ${s.ci.total}${at}`, tone: 'ok' })
  }
  if (s.prod) {
    const { sha, state, at } = s.prod
    const who = sha === s.head ? 'prod = HEAD' : `prod ${sha.slice(0, 7)}`
    if (state === 'success') segs.push({ text: `${who} ✓ ${ago(Date.parse(at), now)}`, tone: 'ok' })
    else if (FAIL.has(state)) segs.push({ text: `${who} ✗ ${state}`, tone: 'bad' })
    else if (WAIT.has(state)) segs.push({ text: `${who} ⏳ deploying`, tone: 'warn' })
    else segs.push({ text: `${who} ${state}`, tone: 'dim' })
  }
  return segs
}

export type Action = { label: string; prompt: string }

export const COMMIT_PROMPT = 'Commit the working tree changes with a sensible message.'
export const PUSH_PROMPT = 'Push the branch.'
const AGE_AFTER = 5 * 60_000 // show how long the tree has been dirty once it is this old

// The band's one-key action: commit while the tree is dirty; else push while commits wait on an upstream; else none.
export function action(s: Snap, now: number): Action | undefined {
  if (s.dirty) {
    const age = s.dirtySince !== undefined && now - s.dirtySince >= AGE_AFTER ? ` · ${ago(s.dirtySince, now)}` : ''
    return { label: `commit ${s.dirty} ${s.dirty === 1 ? 'file' : 'files'}${age}`, prompt: COMMIT_PROMPT }
  }
  if (s.ahead) return { label: `push ↑${s.ahead}`, prompt: PUSH_PROMPT }
  return undefined
}
