import type { EngineInterface as Engine } from 'claude-code'

import type { Entry } from '../types'
import { folderName, mergeEntries, parseJsonl, repoRoot, toJsonl } from './model'

// A host command's trimmed stdout, or undefined on a non-zero exit or a spawn failure.
export async function run($: Engine, argv: string[], cwd?: string): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, cwd ? { cwd, timeoutMs: 10_000 } : { timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

export type Repo = { root: string; name: string; isGit: boolean; worktree?: string }

// The repo a path belongs to; worktrees share their main checkout's root. A non-git path is its own identity.
// One rev-parse call. Git older than 2.31 echoes the unknown --path-format flag, so a non-absolute line means "not git".
export async function identify($: Engine, path: string): Promise<Repo> {
  const out = await run($, ['git', '-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'])
  const [common, top] = out?.split('\n') ?? []
  if (!common?.startsWith('/') || !top?.startsWith('/')) {
    return { root: path, name: path.split('/').filter(Boolean).at(-1) ?? path, isGit: false }
  }
  const root = repoRoot(common)
  const name = root.split('/').filter(Boolean).at(-1) ?? root
  if (top === root) return { root, name, isGit: true }
  return { root, name, isGit: true, worktree: top.startsWith(`${root}/`) ? top.slice(root.length + 1) : top }
}

export type Store = {
  dir: string
  lastSeq: () => number
  append: (entry: Entry) => Promise<string | undefined>
  readAll: () => Promise<{ entries: Entry[]; bad: number }>
}

type Listed = { name: string; kind: string; mtimeMs: number; size: number }

const PART_CHARS = 1_048_576 // start a new part file past 1 MiB of text; $.fs reads and writes cap at 4 MiB

const seqOf = (entries: readonly Entry[]) => entries.reduce((max, e) => Math.max(max, Number(e.id.split('-').at(-1)) || 0), 0)

// One repo's timeline folder. This session rewrites only its current part file (`<session>.jsonl`, then
// `<session>-1.jsonl`, …). Every other file, this session's earlier parts included, is read and cached by mtime and size.
// A part that can't be read or has unreadable lines is never rewritten: writing continues in a new part.
export async function openStore($: Engine, home: string, root: string, session: string): Promise<Store> {
  const dir = `${home}/.claude/timelines/${folderName(root)}`
  const partName = (n: number) => (n ? `${session}-${n}.jsonl` : `${session}.jsonl`)
  const partIndex = (name: string) => {
    if (name === `${session}.jsonl`) return 0
    const m = name.match(/^(.+)-(\d+)\.jsonl$/)
    return m && m[1] === session ? Number(m[2]) : -1
  }
  const cache = new Map<string, { mtimeMs: number; size: number; entries: Entry[]; bad: number }>()
  let part = 0
  let own: Entry[] = []
  let saved = 0 // how many entries of `own` are on disk

  const list = async (): Promise<readonly Listed[] | undefined> => {
    try {
      return await $.fs.list(dir)
    } catch {
      return undefined // no folder yet
    }
  }

  const parts = ((await list()) ?? []).filter(f => f.kind === 'file').map(f => partIndex(f.name)).filter(n => n >= 0)
  if (parts.length) {
    part = Math.max(...parts)
    try {
      const parsed = parseJsonl(await $.fs.read(`${dir}/${partName(part)}`))
      if (parsed.bad) part += 1
      else {
        own = parsed.entries
        saved = own.length
      }
    } catch {
      part += 1 // over 4 MiB or unreadable: leave it alone
    }
  }

  const readAll = async () => {
    const listed = await list()
    if (!listed) return { entries: [...own], bad: 0 }
    const current = partName(part)
    for (const name of [...cache.keys()]) if (!listed.some(f => f.name === name)) cache.delete(name)
    for (const file of listed) {
      if (file.kind !== 'file' || !file.name.endsWith('.jsonl') || file.name === current) continue
      const hit = cache.get(file.name)
      if (hit && hit.mtimeMs === file.mtimeMs && hit.size === file.size) continue
      try {
        cache.set(file.name, { mtimeMs: file.mtimeMs, size: file.size, ...parseJsonl(await $.fs.read(`${dir}/${file.name}`)) })
      } catch {
        cache.delete(file.name)
      }
    }
    const others = [...cache.values()]
    return { entries: mergeEntries([own, ...others.map(c => c.entries)]), bad: others.reduce((n, c) => n + c.bad, 0) }
  }

  const write = async (entry: Entry): Promise<string | undefined> => {
    own = [...own, entry]
    let text = toJsonl(own)
    if (text.length > PART_CHARS && saved > 0) {
      // This part is full; what is saved stays there. Entries not yet on disk move to the next part.
      part += 1
      own = own.slice(saved)
      saved = 0
      text = toJsonl(own)
    }
    try {
      await $.fs.write(`${dir}/${partName(part)}`, text)
      saved = own.length
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  // One write at a time: parallel subagents logging together must not let an older whole-file write land last.
  let chain: Promise<unknown> = Promise.resolve()
  const append = (entry: Entry): Promise<string | undefined> => {
    const next = chain.then(() => write(entry))
    chain = next
    return next
  }

  // Highest id suffix across all of this session's parts, so a new id never repeats one.
  const lastSeq = () =>
    Math.max(seqOf(own), ...[...cache].filter(([name]) => partIndex(name) >= 0).map(([, c]) => seqOf(c.entries)))

  await readAll()
  return { dir, lastSeq, append, readAll }
}
