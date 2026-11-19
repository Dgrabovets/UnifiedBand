import { expect, test } from 'claude-code/testing'

import { categorize, maskTree, contextStats, extraStats, fiveStats, planStats, reuseStats, routerStats, runStats, weeklyStats } from '../hooks/band/board-stats'

const S = { contextStats, fiveStats, weeklyStats, reuseStats, routerStats, planStats, runStats, categorize, extraStats }

const MIN = 60000
const T0 = Date.UTC(2026, 10, 10, 12)
const turn = (n: number, extra: object = {}) => ({ t: 'turn', ts: T0 + n * MIN, session: 's1', project: 'Steward', cost: n * 0.1, compactions: 0, ...extra })

test('context: fill rate, life before a compaction and the first turn over 80%', () => {
  const ctx = [10, 20, 40, 82, 5, 15]
  const events = ctx.map((c, i) => turn(i, { ctx: c, compactions: i >= 4 ? 1 : 0 }))
  const r = S.contextStats(events)
  expect(r.sessions).toBe(1)
  expect(r.lifeTurns).toBe(4)
  expect(r.firstOver80).toBe(4)
  // Rises of 10, 20 and 42; the drop at the compaction is skipped; the rise after it counts: (10 + 20 + 42 + 10) / 4 = 20.5.
  expect(r.fillRate).toBe(20.5)
  expect(r.compactions).toBe(1)
})

test('five-hour windows group by reset time and flag the ones that hit 95%', () => {
  const reset1 = new Date(T0 + 4 * 3600000).toISOString()
  const reset2 = new Date(T0 + 9 * 3600000).toISOString()
  const events = [
    turn(0, { five: 40, fiveReset: reset1 }),
    turn(60, { five: 96, fiveReset: reset1 }),
    turn(400, { five: 30, fiveReset: reset2 }),
  ]
  const r = S.fiveStats(events)
  expect(r.total).toBe(2)
  expect(r.hits).toBe(1)
  expect(r.recent[0].peak).toBe(96)
  expect(r.blockedMinutes).toBeGreaterThan(100)
})

test('router: matrix counts, stayed, up and down, and a /model after a routed prompt is a correction', () => {
  const rows = [
    { ts: T0, session: 's1', parent: 'sonnet', model: 'sonnet', outcome: 'silent', conf: 0.7 },
    { ts: T0 + MIN, session: 's1', parent: 'sonnet', model: 'opus', outcome: 'routed', conf: 0.9 },
    { ts: T0 + 30 * MIN, session: 's1', parent: 'sonnet', model: 'haiku', outcome: 'routed', conf: 0.8 },
  ]
  const events = [{ t: 'model', ts: T0 + 3 * MIN, session: 's1', project: 'Steward' }]
  const r = S.routerStats(rows, events)
  expect(r.matrix['sonnet>sonnet']).toBe(1)
  expect([r.stayed, r.up, r.down, r.routed, r.corrected]).toEqual([1, 1, 1, 2, 1])
  expect(Math.abs(r.avgConf - 0.8) < 1e-9).toBe(true)
})

test('plans: velocity, projects without a plan and stalled plans', () => {
  const now = T0 + 20 * 86400000
  const events = [
    turn(0, { project: 'Steward', plan: { done: 2, total: 10 } }),
    { ...turn(0), ts: now - 86400000, project: 'Steward', plan: { done: 9, total: 10 } },
    { ...turn(0), ts: now - 12 * 86400000, session: 's2', project: 'Old', plan: { done: 1, total: 5 } },
  ]
  const r = S.planStats(events, ['Steward', 'Old', 'SipAndTell'], now)
  expect(r.noPlan).toEqual(['SipAndTell'])
  expect(r.stalled).toEqual(['Old'])
  expect(r.plans.Steward.done).toBe(9)
  expect(r.velocity).toBeGreaterThan(0)
})

test('review and audit: runs, findings and the share followed by edits', () => {
  const events = [
    turn(0, { cost: 1, edits: 0 }),
    turn(10, { cost: 1.5, edits: 0 }),
    { t: 'run', ts: T0 + 10 * MIN, session: 's1', project: 'Steward', kind: 'review', findings: 6, high: 2 },
    turn(20, { cost: 1.7, edits: 3 }),
  ]
  const r = S.runStats(events, T0 + 3600000)
  expect(r.runs).toBe(1)
  expect(r.avgFindings).toBe(6)
  expect(Math.abs(r.avgCost - 0.5) < 1e-9).toBe(true)
  expect(r.fixedShare).toBe(1)
})

test('categories: a long project is Large, a tiny one is Small, board.json can override', () => {
  const tasks = [
    ...Array.from({ length: 12 }, (_, i) => ({ project: 'Steward', started: `2026-11-${String(i + 1).padStart(2, '0')} 10:00`, turns: 60, cost: 25 })),
    { project: 'Quick', started: '2026-11-02 09:00', turns: 3, cost: 0.2 },
  ]
  const r = S.categorize(tasks, [], { projects: { Quick: { label: 'Quick question', category: 'Small' } } })
  expect(r.find((p: { name: string }) => p.name === 'Steward').category).toBe('Large')
  const quick = r.find((p: { name: string }) => p.name === 'Quick')
  expect([quick.category, quick.label]).toEqual(['Small', 'Quick question'])
  expect(S.categorize([{ project: 'Tiny', started: '2026-11-02 09:00', turns: 3, cost: 0.2 }], [], {})[0].category).toBe('Small')
})

test('the Chats group is always the Chat category, however big', () => {
  const tasks = Array.from({ length: 40 }, (_, i) => ({ project: 'Chats', started: `2026-11-${String((i % 28) + 1).padStart(2, '0')} 10:00`, turns: 200, cost: 50 }))
  expect(categorize(tasks, [], {})[0].category).toBe('Chat')
})

test('maskTree swaps project names in values only, so a project called app keeps every field and heading', () => {
  const map = { app: 'Project 1', Reuse: 'Project 2' }
  const doc = { app: 'Board', rows: [['app', 'Large'], ['Reuse', 'x']], title: 'Reuse', note: 'app one' }
  expect(maskTree(doc, map, false)).toEqual({ app: 'Board', rows: [['Project 1', 'Large'], ['Project 2', 'x']], title: 'Project 2', note: 'app one' })
  expect(maskTree({ projects: { app: { label: 'A' } } }, map, true)).toEqual({ projects: { 'Project 1': { label: 'A' } } })
})
