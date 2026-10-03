export type LastAt = number | null

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { lastAt: LastAt; now: number }
  }
}
