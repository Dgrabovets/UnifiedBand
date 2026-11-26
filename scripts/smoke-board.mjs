// A smoke test for the Board page: builds the HTML from the real task ledger plus a synthetic journal and router log,
// runs the page script against a stand-in DOM, and reports what each section drew or the first error.
// Usage: node scripts/smoke-board.mjs [out.html]
// Needs Node 22.15 or later (type stripping, module hooks). Nothing here is part of the mod.
import { registerHooks } from 'node:module'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

// The mod's files import each other without an extension; Node wants one.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.\w+$/.test(spec)) {
      try {
        return next(`${spec}.ts`, ctx)
      } catch {}
    }
    return next(spec, ctx)
  },
})
const { boardHtml, tasksFrom } = await import('../hooks/band/board.ts')

const dir = join(homedir(), '.config', 'ponytail', 'band')
// DEMO=1 builds the page from invented data only (neutral project names, a few chats), for screenshots and the README video.
const DEMO = Boolean(process.env.DEMO)
const NAMES = DEMO ? ['Atlas', 'Harbor', 'Notes'] : ['Steward', 'SipAndTell', 'UnifiedBand']
let tasks = []
if (!DEMO) try {
  tasks = readdirSync(dir).filter(f => f.endsWith('.csv')).flatMap(f => tasksFrom(readFileSync(join(dir, f), 'utf8')))
} catch {}
const now = Date.now()
const MIN = 60000, DAY = 86400000
// A machine with no ledger (a CI runner): a few synthetic sessions, so the page has something to draw.
if (tasks.length === 0) {
  const p2 = n => String(n).padStart(2, '0')
  const at = d => { const t = new Date(now - d * DAY); return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} 10:00` }
  tasks = NAMES.flatMap((project, i) => [1, 2, 3, 5, 8, 11, 15, 19, 24, 28, 34, 38, 44, 50].map(d => ({ key: `${project}-${d}`, started: at(d + i), project, name: 'Synthetic', cost: (2 + i) * (1 + (d % 4) * 0.7), turns: 12 + (d % 5) * 6, agentMinutes: 25 + (d % 6) * 11, tokens: 40000 + d * 9000, reuse: 40, tests: 'passed', level: 'full', model: ['claude-sonnet-5-5', 'claude-opus-5-5'][(d + i) % 2] })))
  if (DEMO) tasks.push(...[2, 4, 6, 9, 13, 17, 21, 26].map(d => ({ key: `chat-${d}`, started: at(d), project: `spare-${d}Xa9`, name: 'Quick question', cost: 0.4 + d * 0.05, turns: 3, agentMinutes: 4, tokens: 9000, reuse: null, tests: '', level: 'full', model: 'claude-haiku-5-5' })))
}
// STREAK=1 adds a session on each of the last ten days, so the streak confetti has something to celebrate.
if (process.env.STREAK) {
  for (let d = 0; d < 10; d++) {
    const t = new Date(now - d * DAY)
    const p2 = n => String(n).padStart(2, '0')
    tasks.push({ key: `streak-${d}`, started: `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} 10:00`, project: NAMES[0], name: 'Streak', cost: 1, turns: 5, agentMinutes: 30, tokens: 1000, reuse: null, tests: '', level: 'ultra', model: 'claude-sonnet-5-5' })
  }
}

// A synthetic journal over three weeks, three projects, so every section has something to draw.
const events = [], audit = [], workers = []
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const projects = NAMES
projects.forEach((project, pi) => {
  for (let d = 20; d >= 0; d -= pi + 1) {
    const session = `${project}-${d}`
    let ctx = 5, cost = 0, comp = 0, done = 2 + (20 - d) * (pi === 2 ? 1.5 : 0.4)
    for (let i = 0; i < 25; i++) {
      const ts = now - d * DAY - 150 * MIN + i * 6 * MIN
      ctx += 2 + rnd() * 4
      if (ctx > 88) { ctx = 12; comp++; events.push({ t: 'compact', ts, session, project, ctx: 88 }) }
      cost += 0.1 + rnd() * 0.3
      const five = Math.min(100, 20 + ((i * 3 + d * 7) % 80))
      events.push({
        t: 'turn', ts, session, project, root: `/x/${project}`, ms: 20000, cost, turns: i + 1, level: 'ultra', model: 'claude-sonnet-5-5', ctx, five,
        fiveReset: new Date(now - d * DAY + (Math.floor(i / 12) + 1) * 5 * 3600000).toISOString(), seven: Math.min(100, 5 + (20 - d) * 3),
        sevenReset: new Date(now + 4 * DAY).toISOString(), compactions: comp, cache: 60 + rnd() * 40, tests: i % 9 ? 'pass' : 'stale', reused: i, created: i * 1.6 | 0, callers: i % 11 === 0 ? 1 : 0, edits: i % 4 ? 1 : 0,
        plan: pi === 1 ? undefined : { done: Math.min(30, done | 0), total: 30 },
      })
      if (i % 6 === 0) events.push({ t: 'prompt', ts, session, project, words: 3, neg: rnd() < 0.15 })
      if (i % 8 === 3) {
        audit.push({ ts, session, parent: 'sonnet', model: (DEMO ? ['sonnet', 'sonnet', 'haiku', 'sonnet', 'opus', 'sonnet'] : ['sonnet', 'opus', 'haiku'])[audit.length % (DEMO ? 6 : 3)], effort: 'low', tier: 'standard', conf: 0.6 + rnd() * 0.3, outcome: DEMO ? (audit.length % 6 === 2 || audit.length % 6 === 4 ? 'routed' : 'silent') : i % 3 ? 'routed' : 'silent', reason: 'moderate scope' })
        if (i % 3 === 1) { workers.push({ ts: ts + MIN, session, outcome: 'delegated', model: 'sonnet', ms: 40000 + i * 900 }, { ts: ts + 2 * MIN, session, outcome: 'worker_usage', model: 'sonnet', actual: 'claude-sonnet-5-5', input: 30000 + i * 700, output: 4000 + i * 90 }) }
        if (i % 3 === 1 && rnd() < 0.4) events.push({ t: 'model', ts: ts + 2 * MIN, session, project, arg: 'sonnet' })
      }
    }
    events.push({ t: 'run', ts: now - d * DAY + 40 * MIN, session, project, kind: d % 2 ? 'review' : 'audit', findings: 3 + (d % 5), high: d % 3, ms: 90000 })
  }
})

// REAL=1 swaps the synthetic journal for the real one: what the mod's boardExtra reads.
let extra = { events, audit, workers, config: DEMO ? { projects: { Atlas: { category: 'Large' }, Harbor: { category: 'Large' } } } : { projects: { SipAndTell: { label: 'Sip & Tell' } } } }
if (process.env.REAL) {
  const realEvents = readdirSync(dir).filter(f => /^events-\d{4}-\d{2}(-\d{2}-[\w-]+)?\.jsonl$/.test(f)).sort().flatMap(f => readFileSync(join(dir, f), 'utf8').split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : [] } catch { return [] } }))
  let realAudit = []
  try {
    realAudit = readFileSync(join(homedir(), '.claude', 'cache', 'router', 'audit.jsonl'), 'utf8').split('\n').flatMap(l => { try { const r = JSON.parse(l); return [{ ts: Date.parse(r.ts), session: r.session_id, parent: r.decision?.parent, model: r.decision?.model, effort: r.decision?.effort, tier: r.decision?.tier, conf: r.decision?.confidence, outcome: r.outcome, reason: r.decision?.reason }] } catch { return [] } })
  } catch {}
  let config = {}
  try { config = JSON.parse(readFileSync(join(dir, 'board.json'), 'utf8')) } catch {}
  extra = { events: realEvents, audit: realAudit, config }
}
const html = boardHtml(tasks, now, extra)
const out = process.argv[2]
if (out) writeFileSync(out, html)

// A stand-in DOM: every element accepts any call, and a few answer like the real thing.
const log = {}
const make = id => {
  const el = new Proxy(function () {}, {
    get(_, p) {
      if (p === Symbol.toPrimitive) return () => ''
      if (p === 'textContent') return id === 'board-data' ? html.split('<script type="application/json" id="board-data">')[1].split('</script>')[0] : ''
      if (p === 'getBoundingClientRect') return () => ({ width: 900, height: 340, left: 0, top: 0 })
      if (p === 'getAttribute') return () => id
      if (p === 'checked') return true
      if (p === 'append' || p === 'appendChild' || p === 'prepend') return (...a) => { log[id] = (log[id] || 0) + a.length; return a[0] }
      if (p === 'querySelectorAll') return () => [make('q')]
      if (p === 'firstChild') return make('first')
      if (p === 'classList') return { toggle() {}, add() {}, remove() {} }
      if (p === 'style') return { setProperty() {} }
      if (p === 'length') return 0
      return make(`${id}.${String(p)}`)
    },
    set() { return true },
    apply() { return make(`${id}()`) },
  })
  return el
}
const byId = {}
const document = {
  getElementById: id => (byId[id] = byId[id] || make(id)),
  createElement: tag => make(tag),
  createElementNS: (_, tag) => make(tag),
  createTextNode: () => make('text'),
  createDocumentFragment: () => make('fragment'),
  querySelectorAll: () => [make('q')],
  querySelector: () => make('q'),
  documentElement: make('html'),
  body: make('body'),
  addEventListener() {},
}
const ctx = { document, window: { addEventListener() {}, scrollTo() {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, URL: { createObjectURL: () => '' }, Blob: class {}, XMLSerializer: class { serializeToString() { return '' } }, Image: class {}, setTimeout, clearTimeout, console, Math, JSON, Date, Array, Set, Object, String, Number }
const scripts = html.split('<script>')
const app = scripts[scripts.length - 1].split('</script>')[0]
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, app)
try {
  runInNewContext(app, ctx)
} catch (e) {
  console.error('PAGE SCRIPT FAILED:', e.stack || e)
  process.exit(1)
}
const filled = ['b-projects', 'b-context', 'b-reuse', 'b-router', 'b-plans', 'b-runs', 'b-extras']
console.log('tasks:', tasks.length, 'events:', extra.events.length, 'audit:', extra.audit.length, 'html bytes:', html.length)
filled.forEach(id => console.log(id.padEnd(12), log[id] ? `drew ${log[id]} nodes` : 'NOTHING'))
if (filled.some(id => !log[id])) process.exit(2)
