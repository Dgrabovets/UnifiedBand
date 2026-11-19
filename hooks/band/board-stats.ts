// @ts-nocheck
// Statistics over the event journal, the router log and the task ledger.
// Real functions, written in plain ES5 style: the tests import them, and the Board page gets their source text (STATS_SRC),
// so the numbers are checked where they are made. No nested named functions: a bundler may wrap those in helpers the page lacks.

const DAYMS = 86400000
const HOURMS = 3600000
export function two(n) { return (n < 10 ? '0' : '') + n }
export function dkey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) }
export function mondayKey(ms) { var d = new Date(ms); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d.getTime()) }
export function sum(a) { return a.reduce(function (x, y) { return x + y }, 0) }
export function mean(a) { return a.length ? sum(a) / a.length : null }
export function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
export function bySession(events) {
  var m = {}
  events.forEach(function (e) { (m[e.session] = m[e.session] || []).push(e) })
  Object.keys(m).forEach(function (k) { m[k].sort(function (a, b) { return a.ts - b.ts }) })
  return m
}
export function ofType(events, t) { return events.filter(function (e) { return e.t === t }) }

// ---- context --------------------------------------------------------------------------------------------------------
// Fill curves per session, how fast the window fills, how long a context lives before a compaction.
export function contextStats(turns) {
  var by = bySession(turns.filter(function (e) { return e.ctx != null })), curves = [], deltas = [], life = [], lifeMin = [], over = [], comp = []
  Object.keys(by).forEach(function (id) {
    var list = by[id]
    if (list.length < 3) return
    curves.push({ id: id, ts: list[list.length - 1].ts, pts: list.map(function (e) { return e.ctx }) })
    var cut = list.length, first80 = -1
    for (var i = 0; i < list.length; i++) {
      var compacted = i > 0 && (list[i].compactions || 0) > (list[i - 1].compactions || 0)
      if (compacted && cut === list.length) cut = i
      if (first80 < 0 && list[i].ctx >= 80) first80 = i + 1
      if (i > 0 && !compacted && list[i].ctx > list[i - 1].ctx) deltas.push(list[i].ctx - list[i - 1].ctx)
    }
    life.push(cut)
    lifeMin.push((list[cut - 1].ts - list[0].ts) / 60000)
    if (first80 > 0) over.push(first80)
    comp.push(list[list.length - 1].compactions || 0)
  })
  curves.sort(function (a, b) { return b.ts - a.ts })
  return { curves: curves.slice(0, 8), sessions: curves.length, fillRate: mean(deltas), lifeTurns: median(life), lifeMinutes: median(lifeMin), firstOver80: median(over), compactions: mean(comp) }
}

// ---- limits ---------------------------------------------------------------------------------------------------------
// One window per reset time: its peak, when it first reached 95%, how fast it filled.
export function limitWindows(turns, key, resetKey, spanMs) {
  var m = {}
  turns.forEach(function (e) {
    if (e[key] == null || !e[resetKey]) return
    var w = m[e[resetKey]] = m[e[resetKey]] || { reset: Date.parse(e[resetKey]), peak: 0, first: e.ts, last: e.ts, hit: null }
    w.peak = Math.max(w.peak, e[key]); w.first = Math.min(w.first, e.ts); w.last = Math.max(w.last, e.ts)
    if (e[key] >= 95 && w.hit == null) w.hit = e.ts
  })
  return Object.keys(m).map(function (k) {
    var w = m[k], hours = Math.max(0.25, (w.last - (w.reset - spanMs)) / HOURMS)
    w.rate = w.peak / hours
    return w
  }).sort(function (a, b) { return a.reset - b.reset })
}
export function fiveStats(turns) {
  var wins = limitWindows(turns, 'five', 'fiveReset', 5 * HOURMS), last = wins[wins.length - 1] || null
  var blocked = sum(wins.filter(function (w) { return w.hit != null }).map(function (w) { return Math.max(0, (w.reset - w.hit) / 60000) }))
  return {
    windows: wins, recent: wins.slice(-12), avgPeak: mean(wins.map(function (w) { return w.peak })),
    hits: wins.filter(function (w) { return w.peak >= 95 }).length, total: wins.length,
    burn: mean(wins.map(function (w) { return w.rate })),
    hoursToLimit: last && last.rate > 0 ? Math.max(0, (100 - last.peak) / last.rate) : null,
    blockedMinutes: blocked
  }
}
// Daily peak of the weekly limit and a straight-line forecast to the day it resets.
export function weeklyStats(turns, now) {
  var days = {}, latest = null
  turns.forEach(function (e) {
    if (e.seven == null) return
    var k = dkey(e.ts); days[k] = Math.max(days[k] || 0, e.seven)
    if (!latest || e.ts > latest.ts) latest = e
  })
  var keys = Object.keys(days).sort().slice(-14), pts = keys.map(function (k, i) { return [i, days[k]] }), forecast = null
  if (latest && latest.sevenReset && pts.length >= 2) {
    var tail = pts.slice(-7), n = tail.length, mx = mean(tail.map(function (p) { return p[0] })), my = mean(tail.map(function (p) { return p[1] }))
    var num = sum(tail.map(function (p) { return (p[0] - mx) * (p[1] - my) })), den = sum(tail.map(function (p) { return (p[0] - mx) * (p[0] - mx) })) || 1
    var slope = Math.max(0, num / den), daysLeft = Math.max(0, (Date.parse(latest.sevenReset) - now) / DAYMS)
    forecast = Math.min(150, pts[pts.length - 1][1] + slope * daysLeft)
  }
  return { keys: keys, values: keys.map(function (k) { return days[k] }), forecast: forecast, current: pts.length ? pts[pts.length - 1][1] : null }
}

// ---- reuse ----------------------------------------------------------------------------------------------------------
export function reuseStats(tasks, turns) {
  var weeks = {}, levels = {}, noTests = 0, counted = 0
  tasks.forEach(function (t) {
    if (t.reuse != null) {
      var w = mondayKey(Date.parse(t.started.replace(' ', 'T'))); (weeks[w] = weeks[w] || []).push(t.reuse)
      ;(levels[t.level || 'off'] = levels[t.level || 'off'] || []).push(t.reuse)
    }
    if (t.level !== 'import') { counted++; if (!t.tests || t.tests === 'not run') noTests++ }
  })
  var keys = Object.keys(weeks).sort().slice(-12)
  var last = {}, by = bySession(turns)
  Object.keys(by).forEach(function (id) { last[id] = by[id][by[id].length - 1] })
  var ends = Object.keys(last).map(function (id) { return last[id] })
  return {
    weekKeys: keys, weekValues: keys.map(function (k) { return mean(weeks[k]) }),
    levels: ['lite', 'full', 'ultra'].map(function (l) { return { level: l, value: levels[l] ? mean(levels[l]) : null, n: levels[l] ? levels[l].length : 0 } }),
    created: sum(ends.map(function (e) { return e.created || 0 })), reused: sum(ends.map(function (e) { return e.reused || 0 })),
    callers: sum(ends.map(function (e) { return e.callers || 0 })), noTestsShare: counted ? noTests / counted : null
  }
}

// ---- model router ---------------------------------------------------------------------------------------------------
const MODEL_ORDER = ['haiku', 'sonnet', 'opus']
// Rough blended price per million tokens (input and output averaged), enough to rank a hop as cheaper or dearer.
const PRICE = { haiku: 0.3, sonnet: 6, opus: 12 }
export function modelKey(s) { s = String(s || '').toLowerCase(); for (var i = 0; i < MODEL_ORDER.length; i++) if (s.indexOf(MODEL_ORDER[i]) >= 0) return MODEL_ORDER[i]; return s || 'unknown' }
export function routerStats(rows, events) {
  var order = MODEL_ORDER.slice(), matrix = {}, stayed = 0, up = 0, down = 0, routed = 0, corrected = 0, saved = 0, extra = 0, conf = []
  rows.forEach(function (r) { [modelKey(r.parent), modelKey(r.model)].forEach(function (m) { if (order.indexOf(m) < 0) order.push(m) }) })
  var turns = bySession(ofType(events, 'turn')), models = bySession(ofType(events, 'model'))
  rows.forEach(function (r) {
    var from = modelKey(r.parent), to = modelKey(r.model), key = from + '>' + to
    matrix[key] = (matrix[key] || 0) + 1
    var d = order.indexOf(to) - order.indexOf(from)
    if (d === 0) stayed++; else if (d > 0) up++; else down++
    if (r.conf) conf.push(r.conf)
    if (r.outcome === 'silent') return
    routed++
    if ((models[r.session] || []).some(function (m) { return m.ts > r.ts && m.ts - r.ts < 600000 })) corrected++
    // The turn that followed the decision: its cost times the price ratio is what the hop saved or added.
    var list = turns[r.session] || [], prev = null, next = null
    for (var i = 0; i < list.length; i++) { if (list[i].ts <= r.ts) prev = list[i]; else { next = list[i]; break } }
    if (next && prev && PRICE[from] && PRICE[to]) {
      var delta = Math.max(0, next.cost - prev.cost), change = delta * (PRICE[to] / PRICE[from] - 1)
      if (change < 0) saved += -change; else extra += change
    }
  })
  return { order: order, matrix: matrix, total: rows.length, stayed: stayed, up: up, down: down, routed: routed, corrected: corrected, saved: saved, extra: extra, avgConf: mean(conf) }
}

// ---- plans ----------------------------------------------------------------------------------------------------------
// Per project: the latest checklist count, when it last moved, and a daily series for the burn-up chart.
export function planStats(events, projects, now) {
  var by = {}
  ofType(events, 'turn').forEach(function (e) { if (e.plan) (by[e.project] = by[e.project] || []).push(e) })
  var plans = {}, daily = {}
  Object.keys(by).forEach(function (p) {
    var list = by[p].sort(function (a, b) { return a.ts - b.ts }), lastChange = list[0].ts
    list.forEach(function (e, i) {
      if (i && e.plan.done !== list[i - 1].plan.done) lastChange = e.ts
      var k = dkey(e.ts); daily[k] = daily[k] || {}; daily[k][p] = e.plan
    })
    var tail = list[list.length - 1], past = list.filter(function (e) { return e.ts <= now - 14 * DAYMS }), base = past.length ? past[past.length - 1] : list[0]
    var span = Math.max(1, (tail.ts - base.ts) / DAYMS)
    plans[p] = { done: tail.plan.done, total: tail.plan.total, lastChange: lastChange, velocity: Math.max(0, (tail.plan.done - base.plan.done) / span) }
  })
  var names = Object.keys(plans)
  var noPlan = projects.filter(function (p) { return !plans[p] })
  var stalled = names.filter(function (p) { return plans[p].done < plans[p].total && now - plans[p].lastChange > 9 * DAYMS })
  var done = sum(names.map(function (p) { return plans[p].done })), total = sum(names.map(function (p) { return plans[p].total })), velocity = sum(names.map(function (p) { return plans[p].velocity }))
  // Burn-up: for each of the last 30 days the sum over projects of their latest known count.
  var keys = [], carry = {}, doneSeries = [], totalSeries = []
  for (var i = 29; i >= 0; i--) keys.push(dkey(now - i * DAYMS))
  Object.keys(daily).sort().forEach(function (k) { if (k < keys[0]) Object.keys(daily[k]).forEach(function (p) { carry[p] = daily[k][p] }) })
  keys.forEach(function (k) {
    if (daily[k]) Object.keys(daily[k]).forEach(function (p) { carry[p] = daily[k][p] })
    doneSeries.push(sum(Object.keys(carry).map(function (p) { return carry[p].done }))); totalSeries.push(sum(Object.keys(carry).map(function (p) { return carry[p].total })))
  })
  return {
    plans: plans, noPlan: noPlan, stalled: stalled, done: done, total: total, velocity: velocity,
    forecastDays: velocity > 0 && total > done ? (total - done) / velocity : null,
    keys: keys, doneSeries: doneSeries, totalSeries: totalSeries
  }
}

// ---- review and audit -----------------------------------------------------------------------------------------------
export function runStats(events, now) {
  var runs = ofType(events, 'run').sort(function (a, b) { return a.ts - b.ts }), turns = bySession(ofType(events, 'turn')), weeks = {}, costs = [], fixed = 0, kinds = { review: 0, audit: 0 }
  runs.forEach(function (r) {
    kinds[r.kind] = (kinds[r.kind] || 0) + 1
    var w = mondayKey(r.ts); weeks[w] = (weeks[w] || 0) + 1
    var list = turns[r.session] || [], at = -1
    for (var i = 0; i < list.length; i++) if (list[i].ts <= r.ts) at = i
    if (at > 0) costs.push(Math.max(0, list[at].cost - list[at - 1].cost))
    var edits = sum(list.filter(function (e) { return e.ts > r.ts && e.ts - r.ts <= 30 * 60000 }).map(function (e) { return e.edits || 0 }))
    if (edits > 0) fixed++
  })
  var keys = []
  for (var i = 11; i >= 0; i--) keys.push(mondayKey(now - i * 7 * DAYMS))
  var known = runs.filter(function (r) { return r.findings != null })
  return {
    runs: runs.length, kinds: kinds, weekKeys: keys, weekValues: keys.map(function (k) { return weeks[k] || 0 }),
    avgCost: mean(costs), avgFindings: mean(known.map(function (r) { return r.findings })), avgHigh: mean(known.filter(function (r) { return r.high != null }).map(function (r) { return r.high })),
    fixedShare: runs.length ? fixed / runs.length : null
  }
}

// ---- project categories ---------------------------------------------------------------------------------------------
// Points for turns, cost, sessions, days of work and a plan: Large, Medium or Small by the total. Chat is only the Chats group
// (the app's spare and scratch folders and the like). board.json can override any project.
export function projectEntry(per, p) { return per[p] = per[p] || { name: p, sessions: 0, turns: 0, cost: 0, days: {}, plan: false } }
export function categorize(tasks, events, config) {
  var per = {}
  tasks.forEach(function (t) { var p = projectEntry(per, t.project); p.sessions++; p.turns += t.turns; p.cost += t.cost; p.days[t.started.slice(0, 10)] = 1 })
  ofType(events, 'turn').forEach(function (e) { if (e.plan) projectEntry(per, e.project).plan = true })
  var cfg = (config && config.projects) || {}
  return Object.keys(per).map(function (n) {
    var p = per[n], days = Object.keys(p.days).length
    var score = Math.min(3, p.turns / 150) + Math.min(3, p.cost / 40) + Math.min(2, p.sessions / 8) + Math.min(2, days / 6) + (p.plan ? 1 : 0)
    var category = n === 'Chats' ? 'Chat' : score >= 5.5 ? 'Large' : score >= 2.5 ? 'Medium' : 'Small'
    var o = cfg[n] || {}
    return { name: n, label: o.label || n, category: o.category || category, score: score, sessions: p.sessions, turns: p.turns, cost: p.cost, days: days, plan: p.plan }
  }).sort(function (a, b) { return b.cost - a.cost })
}

// ---- extras ---------------------------------------------------------------------------------------------------------
export function extraStats(tasks, events, now) {
  var turns = ofType(events, 'turn'), prompts = ofType(events, 'prompt'), by = bySession(turns)
  var cacheDays = {}
  turns.forEach(function (e) { if (e.cache != null) (cacheDays[dkey(e.ts)] = cacheDays[dkey(e.ts)] || []).push(e.cache) })
  var cacheKeys = Object.keys(cacheDays).sort().slice(-30)
  var tests = { pass: 0, fail: 0, stale: 0, none: 0 }
  Object.keys(by).forEach(function (id) { var t = by[id][by[id].length - 1].tests || 'none'; tests[t] = (tests[t] || 0) + 1 })
  var modelCost = {}, levelTime = {}
  tasks.forEach(function (t) {
    var m = t.model ? t.model.replace(/^claude-/, '').split('-')[0] : 'unknown'; modelCost[m] = (modelCost[m] || 0) + t.cost
    var l = t.level || 'off'; levelTime[l] = (levelTime[l] || 0) + t.agentMinutes
  })
  var grid = []
  for (var d = 0; d < 7; d++) { grid.push([]); for (var h = 0; h < 24; h++) grid[d].push(0) }
  turns.forEach(function (e) { var dt = new Date(e.ts); grid[(dt.getDay() + 6) % 7][dt.getHours()]++ })
  var costs = tasks.map(function (t) { return t.cost }), mu = mean(costs) || 0, sd = Math.sqrt(mean(costs.map(function (c) { return (c - mu) * (c - mu) })) || 0)
  var top = tasks.slice().sort(function (a, b) { return b.cost - a.cost }).slice(0, 5).map(function (t) { return { name: t.name || 'Untitled session', project: t.project, cost: t.cost, outlier: sd > 0 && t.cost > mu + 2 * sd } })
  var neg = prompts.filter(function (e) { return e.neg }).length, compacts = ofType(events, 'compact').filter(function (e) { return e.ctx != null }), agents = ofType(events, 'agent')
  return {
    cacheKeys: cacheKeys, cacheValues: cacheKeys.map(function (k) { return mean(cacheDays[k]) }), tests: tests, modelCost: modelCost, levelTime: levelTime, grid: grid, top: top,
    corrections: prompts.length ? neg / prompts.length * 100 : null, prompts: prompts.length,
    compactCtx: mean(compacts.map(function (e) { return e.ctx })), compactions: compacts.length,
    agents: agents.length, agentTokens: sum(agents.map(function (e) { return e.tokens || 0 }))
  }
}

// Hides project names in an export: a string equal to a name is swapped for its alias. Only values change, so a project
// called "app" or "tests" cannot rename a field or a heading. keys: also swap object keys (the config's project map).
export function maskTree(node, map, keys) {
  var has = function (k) { return Object.prototype.hasOwnProperty.call(map, k) }
  if (typeof node === 'string') return has(node) ? map[node] : node
  if (Array.isArray(node)) return node.map(function (x) { return maskTree(x, map, keys) })
  if (node && typeof node === 'object') {
    var out = {}
    Object.keys(node).forEach(function (k) { out[keys && has(k) ? map[k] : k] = maskTree(node[k], map, keys) })
    return out
  }
  return node
}

// What the page runs: the constants as text, then every function above as it was written.
export const STATS_SRC = [
  'var DAYMS = ' + DAYMS + ', HOURMS = ' + HOURMS + ', MODEL_ORDER = ' + JSON.stringify(MODEL_ORDER) + ', PRICE = ' + JSON.stringify(PRICE),
  String(two),
  String(dkey),
  String(mondayKey),
  String(sum),
  String(mean),
  String(median),
  String(bySession),
  String(ofType),
  String(contextStats),
  String(limitWindows),
  String(fiveStats),
  String(weeklyStats),
  String(reuseStats),
  String(modelKey),
  String(routerStats),
  String(planStats),
  String(runStats),
  String(projectEntry),
  String(categorize),
  String(extraStats),
  String(maskTree),
].join('\n')
