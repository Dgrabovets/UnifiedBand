export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Tests = {
  state: 'none' | 'pass' | 'fail' | 'stale'
  passed?: number
  failed?: number
}

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type Band = {
  level: string
  model: string
  cost: number
  spent: number
  turns: number
  turnCosts: number[]
  tokens: Tokens
  busyMs: number
  name: string
  project: string
  session: string
  transcript: string
  reused: string[]
  created: string[]
  removed: string[]
  openCallers: string[]
  tests: Tests
  details: boolean
}

// What routing saved over the last `days`, an estimate: `priced` of the `routed` prompts had the turns to price them.
export type Review = { days: number; total: number; routed: number; corrected: number; priced: number; saved: number; extra: number }

export type Live = {
  branch: string
  root: string
  context?: number
  limits: Limit[]
  tasks: { done: number; total: number } | null
  startedAt?: number
  prompts: number
  compactions: number
  lastTurn?: { ms: number; cache?: number; at: number }
  router?: { total: number; routed: number; last?: { model: string; parent: string; tier: string; confidence: number; effort: string; reason: string; outcome: string; at: number } }
  review?: Review
  reviewOpen?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'unified-band': { band: Band; live: Live; compact: boolean }
  }
}
