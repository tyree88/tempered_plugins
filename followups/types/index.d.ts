export type View = { seq: number; options: string[]; isDraft: boolean }

declare module 'claude-code' {
  interface PluginState {
    followups: { view: View }
  }
}
