export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

export type WhySource = 'captured' | 'spawn' | 'none'

export type Change = {
  v: 1
  id: string // `<session8>-<seq>`
  at: number
  session: string
  agentId?: string // absent: the main loop
  tool: 'Edit' | 'Write' | 'MultiEdit' | 'NotebookEdit' | 'Bash'
  path: string // repo-relative when under the repo, else absolute
  hunks: Hunk[]
  additions: number
  deletions: number
  isNew: boolean
  why: string // '' when none
  whySource: WhySource
  score: number // 0..10
  signals: string[]
  importers?: number
  userModified: boolean
}

export type Agent = {
  agentId: string
  type: string
  description: string
  model: string
  parentAgentId?: string
  startedAt: number
  endedAt?: number
  reads: number
  edits: number
  asks: number
}

export type AgentRow = {
  id: string // agentId or 'main'
  label: string
  model: string
  isRunning: boolean
  files: number
  additions: number
  deletions: number
  score: number | null
  leverage: string // e.g. '3 edits / 7 reads'
}

export type FileRow = { path: string; agents: string[]; ranges: { agent: string; from: number; to: number }[]; hasOverlap: boolean }

export type View = {
  repo: string
  branch?: string
  changes: number
  files: number
  agents: AgentRow[]
  sessionScore: number | null
  mode: 'feed' | 'files'
  filter?: string // agent id
  feed: Change[]
  fileRows: FileRow[]
  expanded: string[] // change ids drawn in full
  page: number
  pages: number
}

declare module 'claude-code' {
  interface PluginState {
    'code-tracer': { view: View | null; changes: Change[]; agents: Agent[] }
  }
}
