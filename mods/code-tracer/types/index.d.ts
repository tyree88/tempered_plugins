export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

// Line span in the file as it was after the edit, trimmed to the hunk's first and last changed line.
export type Span = { from: number; to: number }

export type Signal = { label: string; pts: number } // pts 0 is a flag, not a point

// captured: the agent's own sentence; spawn: a subagent's description; prompt: the user's latest prompt (main, when the
// message stored no text row); judged: v1.1 only.
export type WhySource = 'captured' | 'spawn' | 'prompt' | 'none' | 'judged'

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

// One agent in the header legend; `color` is a theme key shared by its tag and its cards' frames.
export type Legend = { id: string; tag: string; color: string; state: AgentState; changes: number }

// One path: who changed it and where two agents' spans first intersect. Feeds the conflict count and Next steps.
export type FileRow = { path: string; agents: { id: string; tag: string }[]; overlap?: Span }

export type View = {
  repo: string
  branch?: string
  changes: number
  files: number
  running: number
  legend: Legend[]
  conflicts: { files: number; overlapping: number }
  filter?: string // agent id
  pathFilter?: string
  tagWidth: 12 | 18
  feed: Change[] // newest first, one page
  explained: Record<string, { how: string[]; next: string[] }> // per change id on this page, derived from the hunk and the evidence
  expanded: string[] // change ids drawn with the whole hunk
  page: number
  pages: number
}

export type StoreRow = ({ kind: 'change' } & Change) | ({ kind: 'agent' } & Agent)

declare module 'claude-code' {
  interface PluginState {
    'code-tracer': { view: View | null; changes: Change[]; agents: Agent[] }
  }
}
