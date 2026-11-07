export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

// Line span in the file as it was after the edit, trimmed to the hunk's first and last changed line.
export type Span = { from: number; to: number }

export type Signal = { label: string; pts: number } // pts 0 is a flag, not a point

export type WhySource = 'captured' | 'spawn' | 'none' | 'judged' // 'judged' only in v1.1

export type Run = { runner: string; ok: boolean | null; at: number } // ok null: the outcome could not be read

export type Change = {
  v: 1
  id: string // `<session8>-<seq>`
  at: number
  session: string
  agentId?: string // absent: the main loop
  tool: 'Edit' | 'Write' | 'MultiEdit' | 'NotebookEdit' | 'Bash'
  path: string // repo-relative when under the repo, else absolute; `./` and `..` resolved
  hunks: Hunk[]
  spans: Span[] // one per hunk, as captured
  additions: number
  deletions: number
  isNew: boolean
  why: string // '' when none
  whySource: WhySource
  points?: number // undefined on an unscored row (deleted, too large)
  signals: Signal[]
  importerPaths?: string[] // cap 10; undefined = reach unknown
  test?: Run
  check?: { runner: string; ok: boolean; at: number }
  isReverted?: boolean
  isDeleted?: boolean
  isTooLarge?: boolean
  userModified: boolean
}

export type Agent = {
  agentId: string // 'main' for the main loop
  type: string
  tag: string // drawn name, cut to the session's tag width, `#N` on collision
  description: string
  model: string
  parentAgentId?: string
  startedAt: number // main: the start of its current turn
  endedAt?: number // absent while running; cleared on later activity
  reads: number
  edits: number
  asks: number
  lastAt?: number
  lastTool?: string
  lastTarget?: string
}

export type Evidence = { changes: number; testsAfter: number; noWhy: number; reverted: number; sharedFiles: number }

export type AgentState = 'running' | 'done' | 'idle'

export type AgentRow = {
  id: string // agentId or 'main'
  tag: string
  model: string
  description: string
  state: AgentState
  elapsedMs?: number
  last?: { at: number; tool: string; target: string }
  evidence: Evidence
  activity: string // e.g. '3 edits · 7 reads · 2 asked'
}

export type FileSpan = Span & { overlap: boolean }

export type FileRow = {
  path: string
  agents: { id: string; tag: string; state: AgentState; spans: FileSpan[]; lastAt: number }[]
  overlap?: Span // the first intersection of two agents' spans
  lastAt: number
}

export type View = {
  repo: string
  branch?: string
  changes: number
  files: number
  running: number
  agents: AgentRow[]
  hiddenDone: number // done agents collapsed behind `show all`
  evidence: Evidence
  conflicts: { files: number; overlapping: number }
  mode: 'feed' | 'files'
  filter?: string // agent id
  pathFilter?: string
  focusPath?: string
  tagWidth: 12 | 18
  feed: Change[]
  fileRows: FileRow[]
  expanded: string[] // change ids drawn in full
  page: number
  pages: number
  filePage: number
  filePages: number
  improvements: Improvement[] // open findings, drawn under their change
  reflector: Reflector
}

export type ImprovementKind = 'tests' | 'callers' | 'scope' | 'cleanup'

// One reflector finding on one change; closed when a later change touches its target.
export type Improvement = {
  v: 1
  id: string // `<session8>-r<seq>`
  changeId: string
  path: string
  kind: ImprovementKind
  suggestion: string
  at: number
  closedAt?: number
  closedBy?: string // the change id that closed it
}

export type Reflector = { enabled: boolean; open: number; lastAt?: number; lastError?: string }

export type StoreRow = ({ kind: 'change' } & Change) | ({ kind: 'agent' } & Agent) | { kind: 'improvement'; item: Improvement } // `item`: an Improvement has a `kind` of its own

declare module 'claude-code' {
  interface PluginState {
    'code-tracer': { view: View | null; changes: Change[]; agents: Agent[]; improvements: Improvement[] }
  }
}
