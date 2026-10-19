export type Tally = { win: number; pitfall: number }

declare module 'claude-code' {
  interface PluginState {
    lessons: { tally: Tally }
  }
}
