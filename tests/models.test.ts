import { expect, test } from 'claude-code/testing'

import { extraStats, modelKey, routerReview, routerSavings, routerStats } from '../hooks/band/board-stats'
import { CSV_HEADER, mainModel, resume } from '../hooks/band/metrics'

test('every spelling of a model id lands in one family, and only a missing id is unknown', () => {
  const ids = ['sonnet', 'claude-sonnet-5-5', 'claude-opus-5-5[1m]', 'claude-haiku-4-5-20251001', 'us.anthropic.claude-sonnet-4-5-v1:0', 'claude-3-5-sonnet', 'claude-fable-5-2', 'claude-mythos-5', '']
  expect(ids.map(modelKey)).toEqual(['sonnet', 'sonnet', 'opus', 'haiku', 'sonnet', 'sonnet', 'fable', 'fable', 'unknown'])
})

test('cost by model groups the ledger by the same families as the router tab', () => {
  const task = (model: string, cost: number) => ({ project: 'A', name: '', model, cost, level: 'full', agentMinutes: 1 })
  const r = extraStats([task('claude-opus-5-5', 2), task('us.anthropic.claude-opus-5-5', 3), task('claude-fable-5-2', 4), task('', 1)], [], 0)
  expect(r.modelCost).toEqual({ opus: 5, fable: 4, unknown: 1 })
})

test('a cloud provider prefix does not hide the model in the transcript', () => {
  expect(mainModel('"model":"eu.anthropic.claude-opus-5-5-v1:0"')).toBe('eu.anthropic.claude-opus-5-5-v1:0')
})

test('a resumed band keeps the model its ledger row already has', () => {
  const band = { name: '', model: '', busyMs: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
  const csv = `${CSV_HEADER}\nk,2026-11-10 10:00,p,n,1,1,1,0,0,,0,0,0,not run,full,claude-opus-5-5\n`
  expect(resume(band as never, csv, 'k').model).toBe('claude-opus-5-5')
})

const DAY = 86400000
const NOW = Date.UTC(2026, 10, 20)

// A worker's totals: a million of one kind of token costs its price per million.
const worker = (extra: object) => ({ ts: NOW - DAY + 1000, session: 's', outcome: 'worker_usage', model: 'sonnet', actual: 'claude-sonnet-5-5', parent: 'opus', fresh: 0, write: 0, read: 0, output: 1e6, ...extra })
const order = (ts: number, ran: boolean) => ({ ts, session: 's', parent: 'opus', model: 'sonnet', outcome: 'injected', ran })

test('router review: orders that ran are told apart from all workers, and only the period counts', () => {
  const audit = [order(NOW - 40 * DAY, true), order(NOW - DAY, true), order(NOW - DAY, false), { ...order(NOW - DAY, false), outcome: 'plan_mode' }]
  const events = [{ t: 'turn', session: 's', ts: NOW - DAY, model: 'claude-opus-5-5' }]
  const workers = [worker({ auto: true }), worker({ actual: 'claude-opus-5-5', session: 'other', parent: 'sonnet' }), worker({ ts: NOW - 40 * DAY }), worker({ outcome: 'delegated' })]
  const r = routerReview(audit, workers, events, NOW, 30)
  // Sonnet for Opus saves $20 - $10, Opus on a Sonnet session costs the same $10 more.
  expect([r.total, r.orders, r.ran, r.finished, r.priced, r.autoWorkers, r.autoPriced, r.autoSaved, r.saved]).toEqual([3, 2, 1, 2, 2, 1, 1, 10, 0])
  expect(routerReview([], [], [], NOW, 30).total).toBe(0)
})

test('router savings: every kind of token is priced, the journal names the session model, an unknown one is left out', () => {
  const w = worker({ fresh: 1e6, write: 1e6, read: 1e6, parent: 'sonnet' })
  const turns = [{ t: 'turn', session: 's', ts: NOW - 2 * DAY, model: 'claude-fable-5-2' }, { t: 'turn', session: 's', ts: NOW, model: 'claude-opus-5' }]
  // Fable 5.2 (8 + 10 + 0.2 + 40) against Sonnet 5.5 (2 + 2.5 + 0.1 + 10); the later turn does not count.
  expect(Math.abs(routerSavings([], [w], turns).saved - 43.6) < 1e-9).toBe(true)
  // No journal: the family the router saw stands for the model, so Sonnet on Sonnet saves nothing.
  expect(routerSavings([], [w], []).saved).toBe(0)
  const unknown = routerSavings([], [worker({ actual: 'claude-next-9' }), worker({ parent: undefined })], [])
  expect([unknown.finished, unknown.priced]).toEqual([2, 0])
  // A Haiku worker is priced at its long-prompt rate: $2.50 of output against Sonnet's $10.
  expect(routerSavings([], [worker({ actual: 'claude-haiku-5-5', parent: 'sonnet' })], []).saved).toBe(7.5)
})

test('router: a Fable hop ranks above Opus, and only an order counts as routed', () => {
  const rows = [{ ts: 2, session: 's', parent: 'opus', model: 'fable', outcome: 'injected' }, { ts: 3, session: 's', parent: 'opus', model: 'sonnet', outcome: 'plan_mode' }]
  const r = routerStats(rows, [])
  expect([r.up, r.routed, r.order.join()]).toEqual([1, 1, 'haiku,sonnet,opus,fable'])
})
