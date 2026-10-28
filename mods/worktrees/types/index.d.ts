export type Status = 'risk' | 'work' | 'live' | 'safe' | 'gone'

export type Worktree = {
  path: string
  repo: string
  name: string
  branch: string
  isMain: boolean
  isNew: boolean
  status: Status
  reason: string
  idleDays: number
  dirty: number
  localOnly: number
}

export type Repo = { path: string; name: string; worktrees: Worktree[] }

export type Snapshot = { now: number; repos: Repo[]; error: string }

export type Rescue = {
  repo: string
  total: number
  done: number
  current: string
  isRunning: boolean
  results: Record<string, string>
}

declare module 'claude-code' {
  interface PluginState {
    worktrees: {
      snapshot: Snapshot | null
      isRiskOnly: boolean
      isScanning: boolean
      selected: string | null
      rescue: Rescue | null
    }
  }
}
