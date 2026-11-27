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

// What routing saved over the last `days`, an estimate from the workers' tokens. `saved` is every finished worker,
// `autoSaved` only those an order started; both are below zero when the workers cost more than the session model.
export type Review = { days: number; total: number; corrected: number; orders: number; ran: number; finished: number; priced: number; saved: number; autoWorkers: number; autoPriced: number; autoSaved: number }

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
