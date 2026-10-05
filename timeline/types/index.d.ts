export type Fact = { type: 'commit' | 'push' | 'pr' | 'merge' | 'ci'; ref: string; state?: string; url?: string }

export type AgentInfo = {
  id: string
  phase: 'start' | 'end'
  type?: string
  model?: string
  isPinned?: boolean
  isBackground?: boolean
  parentAgentId?: string
  parentTask?: string
  prompt?: string
  status?: 'done' | 'failed'
  durationMs?: number
  tools?: number
  tokens?: number
  result?: string
}

export type Entry = {
  v: 1
  id: string
  at: string
  session: string
  branch?: string
  worktree?: string
  kind: 'talk' | 'work' | 'fact' | 'agent' | 'session'
  title: string
  task?: string
  done?: number
  total?: number
  status?: 'active' | 'done' | 'blocked'
  how?: string
  next?: string
  agentId?: string
  fact?: Fact
  attachTo?: string
  agent?: AgentInfo
  event?: 'open' | 'close'
}

export type LiveAgent = { now?: string; tools: number; startedAt: number }

export type WorkNode = {
  kind: 'work'
  at: string
  title: string
  task: string
  tag: number
  status: 'active' | 'done' | 'blocked'
  done?: number
  total?: number
  how?: string
  next?: string
  facts: string[]
}

export type AgentNode = {
  kind: 'agent'
  at: string
  id: string
  title: string
  depth: number
  type: string
  model: string
  isPinned: boolean
  isBackground: boolean
  state: 'running' | 'done' | 'failed' | 'unknown'
  elapsedMs?: number
  tools: number
  tokens?: number
  now?: string
  next?: string
  done?: number
  total?: number
  result?: string
  prompt?: string
}

export type Node = { kind: 'talk' | 'session' | 'fact'; at: string; title: string } | WorkNode | AgentNode

export type View = { header: string; nodes: Node[]; page: number; pages: number; tz: number // minutes east of UTC (from model.tzMinutes)
  fade: boolean // newest node changed since the last draw: animate it
}

declare module 'claude-code' {
  interface PluginState {
    timeline: { view: View | null }
  }
}
