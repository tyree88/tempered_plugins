import type { Entry, Fact } from '../types'

export type Stamp = { id: string; at: string; session: string; branch?: string; worktree?: string; agentId?: string }
export type Found = { title: string; fact: Fact }

// One line, trimmed, cut to max with an ellipsis; undefined for non-strings and blanks.
export function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '')}…` : text
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'task'
}

// The model's tool input → an entry, or an error message the model reads.
export function fromLog(input: Record<string, unknown>, stamp: Stamp): Entry | { error: string } {
  const title = clip(input.title, 80)
  const kind = input.kind
  if (!title || (kind !== 'talk' && kind !== 'work')) {
    return { error: 'timeline log needs kind ("talk" or "work") and title. Work also takes task, done, total, status, how, next.' }
  }
  if (kind === 'talk') return { v: 1, ...stamp, kind, title }

  const entry: Entry = {
    v: 1,
    ...stamp,
    kind,
    title,
    task: typeof input.task === 'string' && input.task.trim() ? slug(input.task) : slug(title),
    status: input.status === 'done' || input.status === 'blocked' ? input.status : 'active',
  }
  if (typeof input.total === 'number' && Number.isFinite(input.total) && input.total >= 1) {
    entry.total = Math.floor(input.total)
    entry.done = typeof input.done === 'number' && Number.isFinite(input.done) ? Math.min(entry.total, Math.max(0, Math.floor(input.done))) : 0
  }
  const how = clip(input.how, 200)
  if (how) entry.how = how
  const next = clip(input.next, 120)
  if (next) entry.next = next
  return entry
}

const AT_COMMAND = String.raw`(?:^|&&|;|\|\||\n)\s*`
const GIT = String.raw`git(?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?))*\s+`
const GIT_COMMIT = new RegExp(`${AT_COMMAND}${GIT}commit\\b`)
const GIT_PUSH = new RegExp(`${AT_COMMAND}${GIT}push\\b`)
const PR_CREATE = new RegExp(`${AT_COMMAND}gh\\s+pr\\s+create\\b`)
const PR_MERGE = new RegExp(`${AT_COMMAND}gh\\s+pr\\s+merge\\b([^\\n;&|]*)`)

// Last `cd <dir>` in a shell command, resolved against base; undefined when there is none.
export function lastCd(command: string, base: string): string | undefined {
  const all = [...command.matchAll(/(?:^|&&|;|\|\||\n)\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g)]
  const m = all.at(-1)
  const path = m && (m[1] ?? m[2] ?? m[3])
  if (!path || /^[~$-]/.test(path)) return undefined
  return path.startsWith('/') ? path : `${base}/${path}`
}

// Facts a Bash command produced. Commit, push and PR facts must show in the output; a merge comes from the command.
export function factsFromBash(command: string, output: string): Found[] {
  const found: Found[] = []
  if (GIT_COMMIT.test(command)) {
    for (const m of output.matchAll(/^\[.+? ([0-9a-f]{7,40})\] (.+)$/gm)) {
      found.push({ title: `commit ${m[1]} ${clip(m[2], 60) ?? ''}`.trim(), fact: { type: 'commit', ref: m[1]! } })
    }
  }
  if (GIT_PUSH.test(command)) {
    // Git's ref lines: " * [new branch] a -> b", "   1a2b..3c4d  a -> b", " + ... (forced update)"; not "!" rejected, "-" deleted, "=" up to date.
    for (const m of output.matchAll(/^ [ *+] .*? -> (\S+)/gm)) found.push({ title: `push ${m[1]}`, fact: { type: 'push', ref: m[1]! } })
  }
  if (PR_CREATE.test(command)) {
    const m = output.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/)
    if (m) found.push({ title: `PR #${m[1]}`, fact: { type: 'pr', ref: m[1]!, url: m[0] } })
  }
  const merge = command.match(PR_MERGE)
  if (merge && !/--auto\b/.test(merge[1] ?? '')) {
    const n = merge[1]?.match(/(?:^|\s)#?(\d+)(?=\s|$)|\/pull\/(\d+)/)
    const ref = n?.[1] ?? n?.[2]
    found.push({ title: ref ? `merged PR #${ref}` : 'merged PR', fact: { type: 'merge', ref: ref ?? '' } })
  }
  return found
}

const SKIP_ARGS = new Set(['tool', 'tool_use_id', 'agentId', 'consent'])

// The first string argument of a tool call: a Bash command, a file path, a pattern.
export function mainArg(input: Record<string, unknown>): string | undefined {
  const hit = Object.entries(input).find(([key, value]) => !SKIP_ARGS.has(key) && typeof value === 'string')
  return hit ? (hit[1] as string) : undefined
}

type Ci = { sha: string; total: number; pending: number; failed: string[] }

const ciOf = (snap: unknown): Ci | undefined => {
  const ci = (snap as { ci?: unknown } | null | undefined)?.ci as Partial<Ci> | undefined
  return ci && typeof ci.sha === 'string' && typeof ci.total === 'number' && typeof ci.pending === 'number' && Array.isArray(ci.failed)
    ? (ci as Ci)
    : undefined
}

// ship-state's snapshot went from pending to final CI on the same SHA.
export function ciFact(previous: unknown, current: unknown): Found | undefined {
  const a = ciOf(previous)
  const b = ciOf(current)
  if (!a || !b || a.sha !== b.sha || !a.pending || b.pending || !b.total) return undefined
  const sha = b.sha.slice(0, 7)
  return b.failed.length
    ? { title: clip(`CI ✗ ${b.failed.join(', ')} @${sha}`, 80) ?? 'CI ✗', fact: { type: 'ci', ref: b.sha, state: 'failure' } }
    : { title: `CI ✓ ${b.total} @${sha}`, fact: { type: 'ci', ref: b.sha, state: 'success' } }
}

// 32-bit FNV-1a as 8 hex digits: a short, stable folder suffix.
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function folderName(root: string): string {
  const clean = root.replace(/\/+$/, '') || '/'
  return `${clean.split('/').filter(Boolean).at(-1) ?? 'root'}-${fnv1a(clean)}`
}

// `git rev-parse --path-format=absolute --git-common-dir` → the root its worktrees share.
export const repoRoot = (commonDir: string) => commonDir.replace(/\/\.git\/?$/, '') || commonDir

const KINDS = new Set(['talk', 'work', 'fact', 'agent', 'session'])

const isEntry = (value: unknown): value is Entry => {
  const e = value as Partial<Entry> | null
  return (
    !!e &&
    e.v === 1 &&
    typeof e.id === 'string' &&
    typeof e.at === 'string' &&
    typeof e.session === 'string' &&
    typeof e.title === 'string' &&
    typeof e.kind === 'string' &&
    KINDS.has(e.kind)
  )
}

export function parseJsonl(text: string): { entries: Entry[]; bad: number } {
  const entries: Entry[] = []
  let bad = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const value: unknown = JSON.parse(line)
      if (isEntry(value)) entries.push(value)
      else bad++
    } catch {
      bad++
    }
  }
  return { entries, bad }
}

export const toJsonl = (entries: readonly Entry[]) => entries.map(e => JSON.stringify(e)).join('\n') + '\n'

// All lists into one, deduplicated by id, oldest first.
export function mergeEntries(lists: readonly (readonly Entry[])[]): Entry[] {
  const byId = new Map<string, Entry>()
  for (const list of lists) for (const entry of list) byId.set(entry.id, entry)
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id, 'en', { numeric: true }))
}

// `date +%z` output ("-0500") → minutes east of UTC.
export function tzMinutes(text: string | undefined): number {
  const m = text?.trim().match(/^([+-])(\d{2})(\d{2})$/)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}
