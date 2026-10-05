export type Checks = { total: number; pending: number; failed: string[] }

export type Snap = {
  dir: string
  branch: string
  head: string
  dirty: number
  ahead: number | null
  behind: number | null
  pr?: { number: number; state: string }
  ci?: Checks & { sha: string }
  prod?: { sha: string; state: string; url?: string; at: string }
}

declare module 'claude-code' {
  interface PluginState {
    'ship-state': { snap: Snap | null }
  }
}
