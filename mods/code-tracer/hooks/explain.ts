import type { Agent, Change, FileRow } from '../types'
import { declarations, isCodePath, isCosmetic, isTestPath, signatureChanges } from './capture.ts'
import { agentOf, namesFile } from './score.ts'

export type Explained = { how: string[]; next: string[] }

const spanText = (s: { from: number; to: number }) => (s.to > s.from ? `${s.from}-${s.to}` : `${s.from}`)
const base = (path: string) => path.split('/').at(-1) ?? path
const joinAnd = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '')
const list = (paths: readonly string[], max = 3) => `${paths.slice(0, max).map(base).join(', ')}${paths.length > max ? ` +${paths.length - max}` : ''}`

// "How it works": what the hunk did to the file, read from the diff and the importer list. No model, no points.
export function howOf(c: Change): string[] {
  if (c.isDeleted) return ['The file is deleted.']
  if (c.isTooLarge) return [`The diff is too large to show (+${c.additions} −${c.deletions}).`]
  const out: string[] = []
  const decls = declarations(c.hunks, c.path)
  const sigs = signatureChanges(c.hunks)
  if (c.isNew) out.push(`New file with ${c.additions} line${c.additions === 1 ? '' : 's'}.`)
  if (decls.length) out.push(`Adds ${list(decls, 4)}.`)
  if (sigs.length) out.push(`Changes the signature of ${list(sigs, 3)}.`)
  if (!c.isNew && !decls.length) {
    if (isCosmetic(c.hunks, c.path)) out.push('Changes only whitespace or comments.')
    else out.push(`Edits lines ${joinAnd(c.spans.map(spanText))} (+${c.additions} −${c.deletions}).`)
  }
  if (c.importerPaths !== undefined) out.push(c.importerPaths.length ? `${c.importerPaths.length} file${c.importerPaths.length === 1 ? ' imports' : 's import'} it: ${list(c.importerPaths)}.` : 'No file imports it.')
  return out
}

// "Next steps": the open follow-ups the evidence leaves, most urgent first, as commands; one line when none.
export function nextOf(c: Change, all: readonly Change[], agents: readonly Pick<Agent, 'agentId' | 'tag'>[], file: FileRow | undefined): string[] {
  if (c.isDeleted || c.isTooLarge) return []
  if (c.isReverted) return ['The change is reverted. No step is necessary.']
  const out: string[] = []
  const me = agentOf(c)
  const tagOf = (id: string) => agents.find(a => a.agentId === id)?.tag ?? id
  if (c.test && c.test.ok === false) out.push(`Fix the failing ${c.test.runner} run.`)
  if (c.check && !c.check.ok) out.push(`Fix the failing ${c.check.runner} check.`)
  const others = (file?.agents ?? []).filter(a => a.id !== me)
  if (others.length) out.push(`Check the changes of ${joinAnd(others.map(a => a.tag))} in this file.${file?.overlap ? ` Lines ${spanText(file.overlap)} overlap.` : ''}`)
  if (signatureChanges(c.hunks).length && c.importerPaths?.length) out.push(`Update the callers: ${list(c.importerPaths)}.`)
  if (isCodePath(c.path) && !c.test) {
    const test = all.find(e => e.id !== c.id && agentOf(e) === me && isTestPath(e.path) && namesFile(e, c))
    out.push(test ? `Run ${base(test.path)}. It is changed but not run.` : `Run the tests that cover ${base(c.path)}.`)
  }
  if (c.userModified) out.push('You edited this file after the agent. Review the result.')
  if (!c.why) out.push(`No reason is recorded. Ask ${tagOf(me)}.`)
  return out.length ? out : [c.test?.ok ? 'The tests pass. No step is necessary.' : 'No step is necessary.']
}

export const explain = (c: Change, all: readonly Change[], agents: readonly Pick<Agent, 'agentId' | 'tag'>[], file: FileRow | undefined): Explained => ({ how: howOf(c), next: nextOf(c, all, agents, file) })
