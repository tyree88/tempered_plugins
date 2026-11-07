import type { Change, Hunk } from '../types'

export type Patch = { path: string; hunks: Hunk[]; isNew: boolean; userModified: boolean }

// A path under `root` becomes repo-relative; anything else stays as given.
export const relPath = (path: string, root: string | undefined) =>
  root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path

const asHunks = (value: unknown): Hunk[] =>
  Array.isArray(value)
    ? value.filter(
        (h): h is Hunk =>
          !!h && typeof h === 'object' && Array.isArray((h as Hunk).lines) && typeof (h as Hunk).newStart === 'number',
      )
    : []

// Edit, Write, MultiEdit and NotebookEdit results all carry `filePath` and `structuredPatch`. Write says `type: 'create'`
// for a new file; Edit's gitDiff says `status: 'added'`. A result with no hunks is not a change (nothing happened, or
// the diff was too big to compute) and is skipped.
export function patchesFromEdit(result: unknown): Patch[] {
  if (!result || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  const hunks = asHunks(r.structuredPatch)
  if (!hunks.length || typeof r.filePath !== 'string') return []
  const git = r.gitDiff as { status?: string } | undefined
  return [
    {
      path: r.filePath,
      hunks,
      isNew: r.type === 'create' || git?.status === 'added' || r.originalFile === null && r.type !== undefined,
      userModified: r.userModified === true,
    },
  ]
}

// Bash results carry `bashEditDiff.files` when a shell command wrote files. Deleted files are skipped: a deletion has no code to show.
export function patchesFromBash(result: unknown): Patch[] {
  const diff = (result as { bashEditDiff?: { files?: unknown[] } } | undefined)?.bashEditDiff
  if (!diff || !Array.isArray(diff.files)) return []
  return diff.files.flatMap(f => {
    const file = f as { filePath?: string; hunks?: unknown; created?: true; deleted?: true }
    const hunks = asHunks(file.hunks)
    if (!hunks.length || typeof file.filePath !== 'string' || file.deleted) return []
    return [{ path: file.filePath, hunks, isNew: file.created === true, userModified: false }]
  })
}

export const counts = (hunks: Hunk[]) =>
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

const stripComment = (s: string) => s.replace(/^\s*(\/\/|#|\*|\/\*|<!--).*$/, '').replace(/\s+/g, '')

// Cosmetic when every removed line, with whitespace and comments dropped, is matched by an added line and vice versa.
export function isCosmetic(hunks: Hunk[]): boolean {
  const minus: string[] = []
  const plus: string[] = []
  for (const h of hunks)
    for (const l of h.lines) {
      if (l.startsWith('-')) minus.push(stripComment(l.slice(1)))
      else if (l.startsWith('+')) plus.push(stripComment(l.slice(1)))
    }
  if (!minus.length && !plus.length) return true
  const left = minus.filter(Boolean).sort()
  const right = plus.filter(Boolean).sort()
  return left.length === right.length && left.every((l, i) => l === right[i])
}

// `+` lines that declare something callable or exported from outside the file.
const CAPABILITY = /^\+\s*(export\s|(async\s+)?function\s|def\s|class\s|(pub\s+)?fn\s|func\s|interface\s|type\s+\w+\s*=|const\s+\w+\s*=\s*(async\s*)?\(|app\.(get|post|put|delete|use)\(|router\.)/

export const addsCapability = (hunks: Hunk[]) => hunks.some(h => h.lines.some(l => CAPABILITY.test(l)))

export const isTestPath = (path: string) => /(^|\/)(test|tests|__tests__|spec|fixtures?|checks?)\//.test(path) || /\.(test|spec|check)\.[cm]?[jt]sx?$|_test\.(go|py|rs)$|test_.*\.py$/.test(path)
export const isConfigPath = (path: string) => /(^|\/)(package\.json|tsconfig[^/]*\.json|.*\.config\.[cm]?[jt]s|.*\.ya?ml|.*\.toml|\.env[^/]*|Dockerfile|Makefile)$/.test(path)

// The line range a change covers in the new file, for overlap marks in the file view.
export const range = (hunks: Hunk[]) => ({
  from: Math.min(...hunks.map(h => h.newStart)),
  to: Math.max(...hunks.map(h => h.newStart + Math.max(h.newLines, 1) - 1)),
})

export const changeOf = (base: Omit<Change, 'hunks' | 'additions' | 'deletions' | 'isNew' | 'userModified' | 'path' | 'score' | 'signals'>, patch: Patch, root: string | undefined): Change => ({
  ...base,
  path: relPath(patch.path, root),
  hunks: patch.hunks,
  ...counts(patch.hunks),
  isNew: patch.isNew,
  userModified: patch.userModified,
  score: 0,
  signals: [],
})
