import { expect, test } from 'claude-code/testing'

import { extraStats, modelKey, routerReview, routerStats } from '../hooks/band/board-stats'
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

test('router review: only the period counts, and the estimate says how many prompts it priced', () => {
  const row = (ts: number, session: string) => ({ ts, session, parent: 'opus', model: 'sonnet', outcome: 'routed' })
  const audit = [row(NOW - 40 * DAY, 'old'), row(NOW - DAY, 's'), row(NOW - DAY, 'no-turns')]
  const events = [
    { t: 'turn', session: 's', ts: NOW - DAY - 1000, cost: 1 },
    { t: 'turn', session: 's', ts: NOW - DAY + 1000, cost: 3 },
  ]
  const r = routerReview(audit, events, NOW, 30)
  // A turn that cost 2, moved from 12 to 6 per million tokens: half of it is saved.
  expect([r.total, r.routed, r.priced, r.saved, r.extra]).toEqual([2, 2, 1, 1, 0])
  expect(routerReview([], [], NOW, 30).total).toBe(0)
})

test('router: a Fable hop is priced and ranks above Opus', () => {
  const rows = [{ ts: 2, session: 's', parent: 'opus', model: 'fable', outcome: 'routed' }]
  const events = [
    { t: 'turn', session: 's', ts: 1, cost: 0 },
    { t: 'turn', session: 's', ts: 3, cost: 1 },
  ]
  const r = routerStats(rows, events)
  expect([r.up, r.extra, r.order.join()]).toEqual([1, 1, 'haiku,sonnet,opus,fable'])
})
