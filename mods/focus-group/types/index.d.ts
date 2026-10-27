export type AgentStatus = 'running' | 'returned' | 'failed'

export type RosterAgent = {
  id: string
  label: string
  persona: string
  role: string
  focus: string
  status: AgentStatus
  isForeground: boolean
}

export type GateId = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5'
export type GateOutcome = 'pass' | 'conditional' | 'blocked'
export type Gate = { outcome: GateOutcome; evidence: string }

export type Priority = 'blocker' | 'major' | 'minor'
export type Disposition = 'accept' | 'merge' | 'reject' | 'defer' | 'unresolved'
export type FindingStatus = 'pending' | 'incorporated' | 'verified'
export type Finding = {
  id: string
  priority: Priority
  summary: string
  disposition?: Disposition
  status?: FindingStatus
}

export type Run = {
  objective: string
  agents: RosterAgent[]
  gates: Partial<Record<GateId, Gate>>
  findings: Finding[]
}

declare module 'claude-code' {
  interface PluginState {
    'focus-group': { run: Run | null; isExpanded: boolean }
  }
}
