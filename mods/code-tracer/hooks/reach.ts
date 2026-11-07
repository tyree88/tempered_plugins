import { isTestPath } from './capture.ts'

export const REACH_CAP = 10
export const REACH_MIN = 3

const STOP_DIRS = new Set(['types', 'utils', 'lib', 'src', 'app'])

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type ReachQuery = { kind: 'grep'; regex: string } | { kind: 'go'; dir: string; regex: string }

// The `git grep -E` pattern that finds importers of `path`, per extension; undefined → `reach unknown`.
// Patterns are POSIX ERE (no `\b`, no `\s`), so the same string also runs as a JS RegExp in tests.
export function reachQuery(path: string): ReachQuery | undefined {
  const file = path.split('/').at(-1) ?? ''
  const ext = file.match(/\.[^.]+$/)?.[0] ?? ''
  let stem = file.slice(0, file.length - ext.length)
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  if (stem === 'index') {
    const name = dir.split('/').at(-1) ?? ''
    if (!name || STOP_DIRS.has(name)) return undefined
    stem = name
  }
  const s = escapeRe(stem)
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return { kind: 'grep', regex: `['"/]${s}(\\.[cm]?[jt]sx?)?['"]` }
    case '.py':
      return { kind: 'grep', regex: `(from|import)[ \\t]+([A-Za-z0-9_.]*[^A-Za-z0-9_])?${s}([^A-Za-z0-9_]|$)` }
    case '.rs':
      return { kind: 'grep', regex: `::${s}([^A-Za-z0-9_]|$)` }
    case '.go':
      return { kind: 'go', dir, regex: `/${escapeRe(dir.split('/').at(-1) ?? '')}"` }
    default:
      return undefined
  }
}

// Importer paths kept: not the file itself, not a test path, at most REACH_CAP.
export const importersOf = (paths: readonly string[], self: string) =>
  [...new Set(paths)].filter(p => p && p !== self && !isTestPath(p)).slice(0, REACH_CAP)
