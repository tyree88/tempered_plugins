import type { Change, Hunk, Span } from '../types'

export type Patch = { path: string; hunks: Hunk[]; isNew: boolean; userModified: boolean; isDeleted?: true; isTooLarge?: true }

// A relative path is resolved against `cwd`; `.` and `..` segments go; a path under `root` becomes repo-relative.
export function normalizePath(path: string, cwd: string, root: string | undefined): string {
  const joined = path.startsWith('/') ? path : `${cwd}/${path}`
  const out: string[] = []
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  const abs = `/${out.join('/')}`
  return root && abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : abs
}

const asHunks = (value: unknown): Hunk[] =>
  Array.isArray(value)
    ? value.filter(
        (h): h is Hunk =>
          !!h && typeof h === 'object' && Array.isArray((h as Hunk).lines) && typeof (h as Hunk).newStart === 'number',
      )
    : []

// Edit, Write, MultiEdit and NotebookEdit results all carry `filePath` and `structuredPatch`. Write says `type: 'create'`
// for a new file; Edit's gitDiff says `status: 'added'`. No hunks but gitDiff counts → the diff was too large to show.
export function patchesFromEdit(result: unknown): Patch[] {
  if (!result || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  if (typeof r.filePath !== 'string') return []
  const hunks = asHunks(r.structuredPatch)
  const git = r.gitDiff as { status?: string; additions?: number; deletions?: number } | undefined
  const isNew = r.type === 'create' || git?.status === 'added' || (r.originalFile === null && r.type !== undefined)
  const userModified = r.userModified === true
  if (hunks.length) return [{ path: r.filePath, hunks, isNew, userModified }]
  if ((git?.additions ?? 0) + (git?.deletions ?? 0) > 0) return [{ path: r.filePath, hunks: [], isNew, userModified, isTooLarge: true }]
  return []
}

// Bash results carry `bashEditDiff.files` when a shell command wrote files. A deleted file is a row of its own.
export function patchesFromBash(result: unknown): Patch[] {
  const diff = (result as { bashEditDiff?: { files?: unknown[] } } | undefined)?.bashEditDiff
  if (!diff || !Array.isArray(diff.files)) return []
  return diff.files.flatMap(f => {
    const file = f as { filePath?: string; hunks?: unknown; created?: true; deleted?: true }
    if (typeof file.filePath !== 'string') return []
    const hunks = asHunks(file.hunks)
    if (file.deleted) return [{ path: file.filePath, hunks: [], isNew: false, userModified: false, isDeleted: true as const }]
    if (!hunks.length) return []
    return [{ path: file.filePath, hunks, isNew: file.created === true, userModified: false }]
  })
}

export const counts = (hunks: readonly Hunk[]) =>
  hunks.reduce(
    (n, h) => {
      for (const l of h.lines) {
        if (l.startsWith('+')) n.additions += 1
        else if (l.startsWith('-')) n.deletions += 1
      }
      return n
    },
    { additions: 0, deletions: 0 },
  )

// One span per hunk, trimmed to its first and last `+`/`-` line, in the file as it was after the edit.
export function spansOf(hunks: readonly Hunk[]): Span[] {
  return hunks.map(h => {
    let line = h.newStart
    let first: number | undefined
    let last = h.newStart
    for (const l of h.lines) {
      if (l.startsWith('-')) {
        first ??= line
        last = Math.max(last, line)
        continue // a removed line occupies no new line
      }
      if (l.startsWith('+')) {
        first ??= line
        last = line
      }
      line += 1
    }
    return { from: first ?? h.newStart, to: Math.max(first ?? h.newStart, last) }
  })
}

const HASH_COMMENT = /\.(py|rb|sh|yml|yaml|toml|mk)$/
const strip = (s: string, hash: boolean) =>
  s
    .replace(hash ? /#.*$/ : /\/\/.*$|\/\*.*?\*\/|^\s*(\*|\/\*).*$|<!--.*$/, '')
    .replace(/\s+/g, '')

// Cosmetic when the stripped `-` lines equal the stripped `+` lines (whitespace and comments dropped). No rename detection.
export function isCosmetic(hunks: readonly Hunk[], path = ''): boolean {
  const hash = HASH_COMMENT.test(path)
  const minus: string[] = []
  const plus: string[] = []
  for (const h of hunks)
    for (const l of h.lines) {
      if (l.startsWith('-')) minus.push(strip(l.slice(1), hash))
      else if (l.startsWith('+')) plus.push(strip(l.slice(1), hash))
    }
  if (!minus.length && !plus.length) return true
  const left = minus.filter(Boolean).sort()
  const right = plus.filter(Boolean).sort()
  return left.length === right.length && left.every((l, i) => l === right[i])
}

export const isTestPath = (path: string) =>
  /(^|\/)(test|tests|__tests__|spec|fixtures?|checks?)\//.test(path) || /\.(test|spec)\.[^/]+$|_test\.(go|py|rs)$|(^|\/)test_[^/]*\.py$|(^|\/)check\.[cm]?[jt]s$/.test(path)
export const isConfigPath = (path: string) =>
  /(^|\/)(package\.json|tsconfig[^/]*\.json|.*\.config\.[cm]?[jt]s|.*\.ya?ml|.*\.toml|\.env[^/]*|Dockerfile|Makefile|.*\.lock|.*lock\.json)$/.test(path)
export const isCodePath = (path: string) => /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|rb|java|kt|swift|c|cc|cpp|h|cs|php|sh)$/.test(path) && !isTestPath(path) && !isConfigPath(path)

// Top-level declarations a `+` line adds: `adds export <name>`. Not in test paths or markdown.
const DECLS: { re: RegExp; group: number }[] = [
  { re: /^\+(export\s+(default\s+)?)?(async\s+)?(function|class|interface)\s+(\w+)/, group: 5 },
  { re: /^\+(export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\(.*\)\s*=>/, group: 2 },
  { re: /^\+def\s+(\w+)/, group: 1 },
  { re: /^\+(pub\s+)?fn\s+(\w+)/, group: 2 },
  { re: /^\+func\s+(\([^)]*\)\s*)?(\w+)/, group: 2 },
]
const ROUTE = /^\+\s*(app|router|r)\.(get|post|put|patch|delete|use)\(\s*['"`]([^'"`]+)['"`]/
const REGISTER = /^\+\s*\$\.(tool|command)\.register\(/
const NAME_LITERAL = /\bname:\s*['"`]([\w:-]+)['"`]/

export function declarations(hunks: readonly Hunk[], path: string): string[] {
  if (isTestPath(path) || /\.md$/.test(path)) return []
  const names: string[] = []
  for (const h of hunks)
    h.lines.forEach((l, i) => {
      for (const { re, group } of DECLS) {
        const m = l.match(re)
        if (m) {
          if (m[group]) names.push(m[group])
          return
        }
      }
      const route = l.match(ROUTE)
      if (route) {
        names.push(route[3]!)
        return
      }
      if (REGISTER.test(l)) {
        const lit = h.lines.slice(i, i + 12).map(x => x.match(NAME_LITERAL)?.[1]).find(Boolean)
        if (lit) names.push(lit)
      }
    })
  return names
}

// A `-` and a `+` line that declare the same name with different text.
const SIG: { re: RegExp; group: number }[] = [
  { re: /(function|def|fn|func)\s+(\w+)\s*\(/, group: 2 },
  { re: /^\s*(export\s+)?(const\s+)?(\w+)\s*[=:]?\s*(async\s*)?\([^)]*\)\s*(=>|\{|:)/, group: 3 },
]
export function signatureChanges(hunks: readonly Hunk[]): string[] {
  const nameOf = (l: string) => {
    for (const { re, group } of SIG) {
      const m = l.slice(1).match(re)
      if (m) return m[group]
    }
    return undefined
  }
  const out = new Set<string>()
  for (const h of hunks) {
    const minus = new Map<string, string>()
    for (const l of h.lines) if (l.startsWith('-')) for (const n of [nameOf(l)]) if (n) minus.set(n, l.slice(1).trim())
    for (const l of h.lines)
      if (l.startsWith('+')) {
        const n = nameOf(l)
        if (n && minus.has(n) && minus.get(n) !== l.slice(1).trim()) out.add(n)
      }
  }
  return [...out]
}

export const changeOf = (
  base: Omit<Change, 'hunks' | 'spans' | 'additions' | 'deletions' | 'isNew' | 'userModified' | 'path' | 'signals' | 'isDeleted' | 'isTooLarge'>,
  patch: Patch,
  cwd: string,
  root: string | undefined,
): Change => ({
  ...base,
  path: normalizePath(patch.path, cwd, root),
  hunks: patch.hunks,
  spans: spansOf(patch.hunks),
  ...counts(patch.hunks),
  isNew: patch.isNew,
  userModified: patch.userModified,
  signals: [],
  ...(patch.isDeleted ? { isDeleted: true } : {}),
  ...(patch.isTooLarge ? { isTooLarge: true } : {}),
})
