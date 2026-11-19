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
const tasks = readdirSync(dir).filter(f => f.endsWith('.csv')).flatMap(f => tasksFrom(readFileSync(join(dir, f), 'utf8')))
const now = Date.now()
const MIN = 60000, DAY = 86400000
// STREAK=1 adds a session on each of the last ten days, so the streak confetti has something to celebrate.
if (process.env.STREAK) {
  for (let d = 0; d < 10; d++) {
    const t = new Date(now - d * DAY)
    const p2 = n => String(n).padStart(2, '0')
    tasks.push({ key: `streak-${d}`, started: `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} 10:00`, project: 'Steward', name: 'Streak', cost: 1, turns: 5, agentMinutes: 30, tokens: 1000, reuse: null, tests: '', level: 'ultra', model: '' })
  }
}

// A synthetic journal over three weeks, three projects, so every section has something to draw.
const events = [], audit = []
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const projects = ['Steward', 'SipAndTell', 'UnifiedBand']
projects.forEach((project, pi) => {
  for (let d = 20; d >= 0; d -= pi + 1) {
    const session = `${project}-${d}`
    let ctx = 5, cost = 0, comp = 0, done = 2 + (20 - d) * (pi === 2 ? 1.5 : 0.4)
    for (let i = 0; i < 25; i++) {
      const ts = now - d * DAY + i * 6 * MIN
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
        audit.push({ ts, session, parent: 'sonnet', model: ['sonnet', 'opus', 'haiku'][i % 3], effort: 'low', tier: 'standard', conf: 0.6 + rnd() * 0.3, outcome: i % 3 ? 'routed' : 'silent', reason: 'moderate scope' })
        if (i % 3 === 1 && rnd() < 0.4) events.push({ t: 'model', ts: ts + 2 * MIN, session, project, arg: 'sonnet' })
      }
    }
    events.push({ t: 'run', ts: now - d * DAY + 40 * MIN, session, project, kind: d % 2 ? 'review' : 'audit', findings: 3 + (d % 5), high: d % 3, ms: 90000 })
  }
})

const html = boardHtml(tasks, now, { events, audit, config: { projects: { SipAndTell: { label: 'Sip & Tell' } } } })
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
try {
  runInNewContext(app, ctx)
} catch (e) {
  console.error('PAGE SCRIPT FAILED:', e.stack || e)
  process.exit(1)
}
const filled = ['b-projects', 'b-context', 'b-reuse', 'b-router', 'b-plans', 'b-runs', 'b-extras']
console.log('tasks:', tasks.length, 'events:', events.length, 'audit:', audit.length, 'html bytes:', html.length)
filled.forEach(id => console.log(id.padEnd(12), log[id] ? `drew ${log[id]} nodes` : 'NOTHING'))
if (filled.some(id => !log[id])) process.exit(2)
