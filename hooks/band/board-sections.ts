// The Board's statistics sections: their markup, styles and the page script that draws them from the event journal.
// The script text runs inside the page's closure (it uses the helpers of board.ts) and after board-stats.ts's functions.
// No backticks, template placeholders or backslashes inside the script text: it sits in a template literal.

// Nav order and titles; also the list of sections Export all offers.
export const SECTIONS: [string, string, string][] = [
  ['overview', 'Overview', ''],
  ['projects', 'Projects', 'Worked on in the chosen period, by size'],
  ['context', 'Context and limits', 'How fast the window fills and the limits run out'],
  ['reuse', 'Reuse', 'How often Ponytail reused code instead of writing it'],
  ['router', 'Model Router', 'Where your prompts were sent, and whether it helped'],
  ['plans', 'Plans', 'Progress of the PLAN.md checklists'],
  ['runs', 'Review and Audit', 'How the two reports pay off'],
  ['extras', 'Extras', 'Cache, tests, models, working hours and more'],
]

// One card per section: a head with the title and an Export menu, and a body the script fills.
export const sectionHtml = (id: string) => {
  const [, title, sub] = SECTIONS.find(x => x[0] === id) ?? [id, id, '']
  return `<section class="card sec" id="sec-${id}"><div class="sec-head"><div><h3>${title}</h3><div class="sub">${sub}</div></div><div class="exp"><button type="button" class="btn sm" data-export="${id}" aria-haspopup="menu">Export ▾</button></div></div><div class="sec-body" id="b-${id}"></div></section>`
}

export const SECTION_NAV = SECTIONS.map(([id, title]) => `<button type="button" class="nav-item" data-tab="${id}"><span class="name">${title}</span></button>`).join('')

export const SECTIONS_CSS = `
.page{display:none;flex-direction:column;gap:14px}.page.on{display:flex}
.kpis{margin-bottom:0}.chart-card,.sec{margin-bottom:0}
.kpi>*{position:relative;z-index:1}.kpi::after{z-index:0}
#stream{overflow:hidden}.lines{overflow:hidden}
.nav-item{font-size:14px;padding:9px 12px}.nav-item.on{background:var(--track);color:var(--text)}
.top .btn.sm[hidden]{display:none}.top .btn.sm{margin-bottom:8px}
@media print{
.side,.actions,.exp,.theme,.top .btn.sm,.seg,dialog{display:none!important}
.app{display:block}main{padding:0;max-width:none}
.page{display:none}.page.on,.page:not(.print-skip){display:flex}.page.print-skip{display:none!important}
.page{break-after:page}.page:last-of-type{break-after:auto}
.card{box-shadow:none;background:#fff;border:1px solid #ddd;break-inside:avoid}.sec,.chart-card,.kpi,.panel{break-inside:avoid}
body{background:#fff}footer{display:none}
}
.nav-item .name{flex:1}
.sec{padding:20px 22px;margin-bottom:14px;scroll-margin-top:14px}
.sec-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.sec-head .sub{font-size:12px;color:var(--faint);margin-top:2px}
.exp{position:relative}.btn.sm{padding:5px 11px;font-size:12px}
.menu{position:absolute;right:0;top:calc(100% + 6px);z-index:5;min-width:150px;background:var(--panel);border:1px solid var(--line2);border-radius:12px;padding:6px;box-shadow:0 14px 40px rgba(0,0,0,.35)}
.menu[hidden]{display:none}
.menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--text);font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;cursor:pointer}.menu button:hover{background:var(--track)}
.grp{display:inline-flex;border:1px solid var(--line2);border-radius:11px;overflow:hidden;background:var(--track)}
.grp button{border:0;border-left:1px solid var(--line);background:transparent;color:var(--text);font:inherit;font-size:13px;padding:8px 14px;cursor:pointer;white-space:nowrap}.grp button:first-child{border-left:0}.grp button:hover{background:var(--segOn)}
.actions{flex-wrap:wrap;justify-content:flex-end}
.panel{border:1px solid var(--line);border-radius:18px;padding:16px 18px;min-width:0}
.panel-t{font-weight:600;font-size:14px}.panel-s{font-size:12px;color:var(--faint);margin:2px 0 12px}
.g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
.stats2,.stats3,.stats4{display:grid;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.stats2{grid-template-columns:repeat(2,minmax(0,1fr))}.stats3{grid-template-columns:repeat(3,minmax(0,1fr))}.stats4{grid-template-columns:repeat(4,minmax(0,1fr))}
.stat-l{font-size:12px;color:var(--muted)}.stat-v{font-size:20px;margin:2px 0}.stat-s{font-size:11px;color:var(--faint)}
.lines{display:block;width:100%;height:150px;overflow:visible}
.cols{position:relative;height:100px;margin:6px auto 0;display:flex;align-items:flex-end;justify-content:center;gap:14px;border-bottom:1px solid var(--line);max-width:520px}
.cols i{width:18px;border-radius:9px;display:block}.cols .thr{position:absolute;left:0;right:0;border-top:1.5px dashed rgba(224,96,90,.55)}
.leg{display:flex;justify-content:center;gap:16px;margin-top:10px;flex-wrap:wrap;font-size:12px;color:var(--muted)}.leg span{display:flex;align-items:center;gap:6px}.ldot{width:8px;height:8px;border-radius:50%;display:inline-block}
.hrow{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:9px;font-size:13px}
.hl{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hbar{height:9px;border-radius:5px;background:var(--track);overflow:hidden}.hbar i{display:block;height:100%;border-radius:5px}.hv{text-align:right;min-width:48px}
.empty-sec{color:var(--faint);padding:18px 4px;font-size:13px}.note{font-size:11px;color:var(--faint);margin-top:10px}
.alert{display:flex;gap:8px;align-items:center;background:var(--warnbg);color:var(--warn);border-radius:12px;padding:9px 12px;font-size:12px;margin-bottom:12px}
.mx{border-collapse:separate;border-spacing:8px;width:100%;font-size:13px;text-align:center;table-layout:fixed}
.mx th{font-weight:400;color:var(--muted);font-size:12px;text-align:center;vertical-align:middle}.mx th.r{text-align:right;padding-right:10px;width:70px}
.mx td{border-radius:12px;padding:14px 4px;font-size:16px;vertical-align:middle;font-family:${'"JetBrains Mono",ui-monospace,monospace'}}
.mx td small{display:block;font:10px Inter,sans-serif;color:var(--faint);margin-top:2px}.mx td.st{border:1.5px solid var(--line2)}.mx td.tt{color:var(--muted)}
.dt{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.dt th{font-weight:400;color:var(--faint);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}.dt td{padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}.dt td.why{white-space:normal;color:var(--muted)}
.tag{font-size:11px;padding:2px 9px;border-radius:999px;white-space:nowrap;background:var(--nonebg);color:var(--muted)}.tag.ok{background:var(--okbg);color:var(--ok)}.tag.warn{background:var(--warnbg);color:var(--warn)}.tag.bad{background:var(--badbg);color:var(--bad)}
.li{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line);font-size:13px}.li .sp{flex:1}.li .mut{color:var(--faint);font-size:12px}
.pcat{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
.tile{border:1px solid var(--line);border-radius:14px;padding:10px 12px}.tile b{display:block;font:500 22px ${'"JetBrains Mono",ui-monospace,monospace'}}.tile span{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}
.proj{display:grid;grid-template-columns:150px minmax(0,1fr) 70px 16px;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line);cursor:pointer;background:transparent;border-left:0;border-right:0;border-bottom:0;width:100%;color:var(--text);font:inherit;text-align:left}.proj:hover{background:var(--track)}
.hm{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px;margin-top:6px}.hm i{aspect-ratio:1;border-radius:4px;display:block;background:var(--empty)}
.cat-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--line2)}
@media (max-width:1100px){.g3,.stats4,.pcat{grid-template-columns:repeat(2,minmax(0,1fr))}.g2{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.g3,.stats3,.stats4,.stats2,.pcat{grid-template-columns:minmax(0,1fr)}.proj{grid-template-columns:100px minmax(0,1fr) 60px}}
`

export const SECTIONS_JS = `
var EV = D.events || [], AUD = D.audit || [], CFG = D.config || {}
var C = { blue: '#6cb4f0', purple: '#b07cf0', green: '#4fc88e', amber: '#f0a050', red: '#e0605a', pink: '#e0709a', teal: '#3cc4b0', yellow: '#f0c85a' }
var NL = String.fromCharCode(10), NBSP = String.fromCharCode(160), EXPORTS = {}, uid = 0, sessionProject = {}
var CATS = [['Large', C.red], ['Medium', C.amber], ['Small', C.green], ['Chat', C.blue]]
EV.forEach(function (e) { sessionProject[e.session] = e.project })
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }
function sinceMs() { return state.period ? now - state.period * DAY : 0 }
function scopeEv() { return EV.filter(function (e) { return e.ts >= sinceMs() && (!state.project || e.project === state.project) }) }
function scopeAud() { return AUD.filter(function (r) { return r.ts >= sinceMs() && (!state.project || sessionProject[r.session] === state.project) }) }
function scopeTasks() { return inDays(scope(), days(span())) }
function labelOf(name) { var o = (CFG.projects || {})[name]; return o && o.label ? o.label : name }
function pct(v) { return v == null ? '–' : Math.round(v) + '%' }
function num1(v) { return v == null ? '–' : String(Math.round(v * 10) / 10) }
function hrs(v) { return v == null ? '–' : v < 1 ? Math.round(v * 60) + 'm' : Math.floor(v) + 'h ' + Math.round((v % 1) * 60) + 'm' }
function ago(ms) { var m = Math.max(0, Math.round((now - ms) / 60000)); return m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago' }
function dateOf(ms) { return shortDate(dkey(ms)) }

function stat(label, value, sub, color) {
  var d = h('div', 'stat'), v = h('div', 'stat-v num', value)
  if (color) v.style.color = color
  d.append(h('div', 'stat-l', label), v, h('div', 'stat-s', sub || NBSP)); return d
}
function row(cls, kids) { var d = h('div', cls); kids.forEach(function (k) { if (k) d.append(k) }); return d }
function panel(title, sub) {
  var p = h('div', 'panel'); p.append(h('div', 'panel-t', title)); if (sub) p.append(h('div', 'panel-s', sub))
  for (var i = 2; i < arguments.length; i++) {
    var a = arguments[i]
    if (Array.isArray(a)) a.forEach(function (k) { p.append(k) }); else if (a) p.append(a)
  }
  return p
}
function legendRow(items) {
  var d = h('div', 'leg')
  items.forEach(function (it) { var s = h('span'), dot = h('i', 'ldot'); dot.style.background = it[0]; s.append(dot, document.createTextNode(it[1])); d.append(s) })
  return d
}
function hbar(label, value, max, color, text) {
  var r = h('div', 'hrow'), t = h('div', 'hbar'), i = h('i')
  i.style.width = Math.max(value > 0 ? 2 : 0, Math.min(100, value / (max || 1) * 100)) + '%'; i.style.background = color; t.append(i)
  r.append(h('span', 'hl', label), t, h('span', 'hv num', text)); return r
}
function tag(text, kind) { return h('span', 'tag' + (kind ? ' ' + kind : ''), text) }
function emptyBody(id, title, text) {
  var b = byId('b-' + id); b.textContent = ''; b.append(h('div', 'empty-sec', text)); EXPORTS[id] = { title: title, headers: ['Metric', 'Value'], rows: [] }; return b
}
// Soft lines: monotone curves, round caps, an optional fade under the line and an optional dashed continuation.
function lines(series, o) {
  var W = 600, H = o.h || 150, n = o.n || Math.max.apply(null, series.map(function (s) { return (s.from || 0) + s.pts.length }).concat([2]))
  var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'class': 'lines', role: 'img', 'aria-label': o.label || '' }), defs = svg('defs', {}, s)
  var max = o.max || 100
  function y(v) { return H - 6 - Math.max(0, Math.min(max, v)) / max * (H - 12) }
  function x(i) { return n > 1 ? i * W / (n - 1) : W / 2 }
  svg('line', { x1: 0, x2: W, y1: H - 1, y2: H - 1, 'class': 'base' }, s)
  ;(o.thr || []).forEach(function (t) { svg('line', { x1: 0, x2: W, y1: y(t), y2: y(t), stroke: C.red, 'stroke-opacity': .6, 'stroke-dasharray': '4 5', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }, s) })
  series.forEach(function (ser) {
    if (ser.pts.length < 2) return
    var pts = ser.pts.map(function (v, i) { return [x((ser.from || 0) + i), y(v)] }), d = smooth(pts), id = 'ln' + (uid++)
    if (ser.fill) {
      gradient(defs, id, 0, H, [[0, ser.color, .32], [1, ser.color, 0]])
      svg('path', { d: d + 'L' + pts[pts.length - 1][0] + ',' + H + 'L' + pts[0][0] + ',' + H + 'Z', fill: 'url(#' + id + ')' }, s)
    }
    var a = { d: d, fill: 'none', stroke: ser.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }
    if (ser.dash) a['stroke-dasharray'] = '6 5'
    svg('path', a, s)
  })
  if (!series.some(function (ser) { return ser.pts.length >= 2 })) svg('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'class': 'empty-chart' }, s).textContent = 'Not enough points yet'
  return s
}
// Rounded columns, centred. Plain blocks, not a stretched SVG, so the rounding stays round.
function columns(vals, o) {
  var box = h('div', 'cols'), max = o.max || Math.max.apply(null, vals.concat([1]))
  if (o.thr != null) { var t = h('span', 'thr'); t.style.top = (100 - o.thr / max * 100) + '%'; box.append(t) }
  vals.forEach(function (v, i) {
    var c = h('i'); c.style.height = Math.max(3, v / max * 100) + '%'; c.style.background = o.color ? o.color(v, i) : C.blue
    c.title = o.title ? o.title(v, i) : String(v); box.append(c)
  })
  return box
}
function setExport(id, title, headers, rows) { EXPORTS[id] = { title: title, headers: headers, rows: rows } }

// ---- overview export and projects ---------------------------------------------------------------------------------
function drawOverviewExport() {
  var tk = scopeTasks(), cats = categorize(tk, EV, CFG)
  var rows = [['Sessions', String(tk.length)], ['Agent time', time(total(tk, METRICS.time.pick))], ['Cost', money(total(tk, METRICS.cost.pick))], ['Tokens', tok(total(tk, METRICS.tokens.pick))], ['Projects', String(cats.length)]]
  CATS.forEach(function (c) { rows.push([c[0] + ' projects', String(cats.filter(function (p) { return p.category === c[0] }).length)]) })
  setExport('overview', 'Overview', ['Metric', 'Value'], rows)
}
function drawProjects() {
  var b = byId('b-projects'); b.textContent = ''
  var all = categorize(scopeTasks(), EV, CFG), cats = all.filter(function (p) { return p.name !== 'Chats' }), chats = all.filter(function (p) { return p.name === 'Chats' })[0]
  if (state.project) {
    var me = cats.filter(function (p) { return p.name === state.project })[0], back = h('button', 'btn sm', '← All projects'); back.type = 'button'
    back.addEventListener('click', function () { state.project = ''; state.hidden = {}; render() })
    var chip = h('span', 'cat-chip', me ? me.category : 'No sessions in this period'), dot = h('i', 'ldot'); dot.style.background = me ? (CATS.filter(function (c) { return c[0] === me.category })[0] || ['', C.blue])[1] : C.blue; chip.prepend(dot)
    b.append(row('li', [back, chip, h('span', 'sp'), h('span', 'mut', me ? plural(me.sessions, 'session') + ' · ' + plural(me.days, 'day') + ' · ' + money(me.cost) : '')]))
    setExport('projects', 'Project', ['Metric', 'Value'], me ? [['Name', labelOf(me.name)], ['Category', me.category], ['Sessions', String(me.sessions)], ['Turns', String(me.turns)], ['Cost', money(me.cost)], ['Days', String(me.days)], ['Plan', me.plan ? 'yes' : 'no']] : [])
    return
  }
  if (!cats.length && !chats) return emptyBody('projects', 'Projects', 'No sessions in this period.')
  var tiles = h('div', 'pcat'), spend = total(cats, function (p) { return p.cost }) || 1
  CATS.forEach(function (c) {
    var t = h('div', 'tile'), l = h('span'), dot = h('i', 'ldot'); dot.style.background = c[1]; l.append(dot, document.createTextNode(c[0]))
    var isChat = c[0] === 'Chat'
    if (isChat) l.lastChild.textContent = 'Chats, sessions'
    t.append(l, h('b', '', isChat ? String(chats ? chats.sessions : 0) : String(cats.filter(function (p) { return p.category === c[0] }).length))); tiles.append(t)
  })
  b.append(h('div', 'stat-l', plural(cats.length, 'project') + ' worked on'), tiles, h('div', 'stat-s', 'Large projects, share of cost. Click one for its own page.'))
  cats.filter(function (p) { return p.category === 'Large' }).forEach(function (p) {
    var r = h('button', 'proj'), t = h('div', 'hbar'), i = h('i'); r.type = 'button'
    i.style.width = Math.max(2, p.cost / spend * 100) + '%'; i.style.background = C.red; t.append(i)
    r.append(h('span', '', labelOf(p.name)), t, h('span', 'num', money(p.cost)), h('span', 'mut', '›'))
    r.addEventListener('click', function () { state.project = p.name; state.hidden = {}; render(); showPage('overview') })
    b.append(r)
  })
  if (!cats.some(function (p) { return p.category === 'Large' })) b.append(h('div', 'empty-sec', 'No large project in this period.'))
  setExport('projects', 'Projects', ['Project', 'Category', 'Sessions', 'Turns', 'Cost', 'Days', 'Plan'], all.map(function (p) { return [labelOf(p.name), p.category, String(p.sessions), String(p.turns), money(p.cost), String(p.days), p.plan ? 'yes' : 'no'] }))
}

// ---- context and limits ----------------------------------------------------------------------------------------------
function drawContext() {
  var turns = ofType(scopeEv(), 'turn')
  if (!turns.length) return emptyBody('context', 'Context and limits', 'No journal data in this period yet. The band records every turn from now on.')
  var b = byId('b-context'); b.textContent = ''
  var c = contextStats(turns), f = fiveStats(turns), w = weeklyStats(turns, now)
  var curves = panel('Context fill per session', 'Each line is one session, by turn. Dashed is 80%.',
    lines(c.curves.map(function (s, i) { return { pts: s.pts, color: PALETTE[i % PALETTE.length] } }), { thr: [80], label: 'Context fill per session' }),
    row('stats3', [stat('Fill rate', c.fillRate == null ? '–' : num1(c.fillRate) + '%', 'of the window per turn'), stat('Median life', c.lifeTurns == null ? '–' : Math.round(c.lifeTurns) + ' turns', c.lifeMinutes == null ? '' : Math.round(c.lifeMinutes) + ' min, ' + num1(c.compactions) + ' compactions per session'), stat('First over 80%', c.firstOver80 == null ? '–' : 'turn ' + Math.round(c.firstOver80), 'median across sessions')]))
  var five = panel('5-hour windows', 'Peak of each window, last 12. Dashed line is 95%.',
    columns(f.recent.map(function (x) { return x.peak }), { max: 100, thr: 95, color: function (v) { return v >= 95 ? C.red : v >= 70 ? C.amber : C.blue }, title: function (v) { return Math.round(v) + '%' } }),
    legendRow([[C.blue, 'under 70%'], [C.amber, '70 to 94%'], [C.red, '95% or more']]),
    row('stats2', [stat('Average peak', pct(f.avgPeak)), stat('At 95% or more', f.total ? f.hits + ' of ' + f.total : '–'), stat('Burn rate', f.burn == null ? '–' : num1(f.burn) + '%/h'), stat('Time to limit', hrs(f.hoursToLimit), 'at the current pace')]))
  var forecast = w.forecast == null ? [] : [{ pts: [w.values[w.values.length - 1], w.forecast], from: w.values.length - 1, color: C.amber, dash: 1 }]
  var weekly = panel('Weekly limit', 'Daily peak, dashed is the forecast to the reset.',
    lines([{ pts: w.values, color: C.amber, fill: 1 }].concat(forecast), { thr: [100], n: w.values.length + (w.forecast == null ? 0 : 1), label: 'Weekly limit' }),
    row('stats2', [stat('Forecast at reset', w.forecast == null ? '–' : pct(w.forecast), w.forecast != null && w.forecast >= 100 ? 'the limit would run out' : ''), stat('Lost to waiting', f.blockedMinutes ? dur(Math.round(f.blockedMinutes)) : '0m', 'after 95% blocks')]))
  var blocks = panel('Blocks', 'Windows that reached 95%, latest first')
  var hit = f.windows.filter(function (x) { return x.hit != null }).reverse().slice(0, 5)
  hit.forEach(function (x) { blocks.append(row('li', [tag(Math.round(x.peak) + '%', x.peak >= 100 ? 'bad' : 'warn'), h('span', '', dateOf(x.hit)), h('span', 'sp'), h('span', 'mut', 'blocked ' + dur(Math.round(Math.max(0, (x.reset - x.hit) / 60000))))])) })
  if (!hit.length) blocks.append(h('div', 'empty-sec', 'No window reached 95%.'))
  b.append(curves, row('g3', [five, weekly, blocks]))
  setExport('context', 'Context and limits', ['Metric', 'Value'], [
    ['Context fill rate, % per turn', num1(c.fillRate)], ['Median context life, turns', num1(c.lifeTurns)], ['Median context life, minutes', num1(c.lifeMinutes)], ['Compactions per session', num1(c.compactions)], ['First turn over 80%', num1(c.firstOver80)],
    ['5-hour windows', String(f.total)], ['Windows at 95% or more', String(f.hits)], ['Average window peak, %', num1(f.avgPeak)], ['Burn rate, % per hour', num1(f.burn)], ['Hours to limit at current pace', num1(f.hoursToLimit)], ['Minutes lost to blocks', String(Math.round(f.blockedMinutes))],
    ['Weekly limit now, %', num1(w.current)], ['Weekly forecast at reset, %', num1(w.forecast)]])
}

// ---- reuse ----------------------------------------------------------------------------------------------------------
function drawReuse() {
  var tk = scopeTasks(), r = reuseStats(tk, ofType(scopeEv(), 'turn')), b = byId('b-reuse'); b.textContent = ''
  if (!tk.length) return emptyBody('reuse', 'Reuse', 'No sessions in this period.')
  var trend = panel('Reuse over time', 'Share of new code that reused something, by week',
    lines([{ pts: r.weekValues.map(function (v) { return v == null ? 0 : v }), color: C.green, fill: 1 }], { label: 'Reuse share by week' }))
  r.levels.forEach(function (l) { trend.append(hbar(cap(l.level), l.value == null ? 0 : l.value, 100, C.green, l.value == null ? '–' : pct(l.value))) })
  trend.append(row('stats3', [stat('New / reused', r.created + ' / ' + r.reused, 'definitions in the journal'), stat('Callers left open', String(r.callers), 'removed code still called'), stat('Tasks without tests', pct(r.noTestsShare == null ? null : r.noTestsShare * 100), 'of sessions')]),
    h('div', 'note', 'Higher levels also tend to show fewer turns per task. That is a correlation, not proof.'))
  b.append(trend)
  setExport('reuse', 'Reuse', ['Metric', 'Value'], [['Reuse, lite %', num1(r.levels[0].value)], ['Reuse, full %', num1(r.levels[1].value)], ['Reuse, ultra %', num1(r.levels[2].value)], ['New definitions', String(r.created)], ['Reused definitions', String(r.reused)], ['Callers left open', String(r.callers)], ['Sessions without tests, %', num1(r.noTestsShare == null ? null : r.noTestsShare * 100)]].concat(r.weekKeys.map(function (k, i) { return ['Week of ' + k + ', reuse %', num1(r.weekValues[i])] })))
}

// ---- model router ---------------------------------------------------------------------------------------------------
function drawRouter() {
  var rows = scopeAud()
  if (!rows.length) return emptyBody('router', 'Model Router', 'No router decisions in this period. The router logs one line per classified prompt.')
  var b = byId('b-router'); b.textContent = ''
  var ev = scopeEv(), r = routerStats(rows, ev), models = ofType(ev, 'model')
  if (r.total >= 5 && r.routed === 0) b.append(h('div', 'alert', 'The router stayed silent for all ' + r.total + ' classified prompts: every one stayed on the model you were on.'))
  var head = h('tr'); head.append(h('th', 'r'))
  r.order.forEach(function (m) { head.append(h('th', '', cap(m))) }); head.append(h('th', '', 'Total'))
  var body = h('tbody'), TINT = { haiku: C.green, sonnet: C.blue, opus: C.purple }
  r.order.forEach(function (from) {
    var tr = h('tr'), rowTotal = 0; tr.append(h('th', 'r', cap(from)))
    r.order.forEach(function (to, j) {
      var n = r.matrix[from + '>' + to] || 0, d = j - r.order.indexOf(from), td = h('td', d === 0 ? 'st' : '')
      rowTotal += n; td.style.background = (TINT[to] || C.pink) + (n ? (d === 0 ? '55' : '33') : '11')
      td.append(document.createTextNode(String(n)), h('small', '', n ? (d === 0 ? 'stayed' : d > 0 ? 'up' : 'down') : NBSP)); tr.append(td)
    })
    tr.append(h('td', 'tt', String(rowTotal))); body.append(tr)
  })
  var thead = h('thead'); thead.append(head)
  var table = h('table', 'mx'); table.append(thead, body)
  var matrix = panel('Where prompts went', 'Rows are the model you were on, columns the model the router picked.', table,
    row('leg', [h('span', '', 'Stayed: ' + r.stayed + ' of ' + r.total + ' · ' + Math.round(r.stayed / r.total * 100) + '%'), h('span', '', 'Sent up: ' + r.up), h('span', '', 'Sent down: ' + r.down)]),
    row('stats4', [stat('Saved, est.', money(r.saved), 'from down hops'), stat('Extra, est.', '+' + money(r.extra), 'from up hops'), stat('Avg confidence', r.avgConf == null ? '–' : (Math.round(r.avgConf * 100) / 100).toFixed(2), 'classifier score'), stat('Corrected by you', String(r.corrected), 'of ' + r.routed + ' routed')]))
  var last = panel('Last decisions', 'What you were on, what it picked and why'), t = h('table', 'dt'), th = h('tr')
  ;['When', 'You were on', 'Sent to', 'Effort', 'Outcome', 'Why'].forEach(function (x) { th.append(h('th', '', x)) })
  var tb = h('tbody'); t.append(h('thead'), tb); t.firstChild.append(th)
  rows.slice().sort(function (a, c) { return c.ts - a.ts }).slice(0, 6).forEach(function (x) {
    var fix = x.outcome !== 'silent' && models.some(function (m) { return m.session === x.session && m.ts > x.ts && m.ts - x.ts < 600000 }), tr = h('tr'), out = tr.appendChild(h('td'))
    tr.prepend(h('td', '', ago(x.ts)), h('td', '', cap(modelKey(x.parent))), h('td', '', cap(modelKey(x.model))), h('td', '', x.effort || '–'))
    out.append(tag(fix ? 'you switched back' : x.outcome === 'silent' ? 'kept' : 'routed', fix ? 'warn' : x.outcome === 'silent' ? '' : 'ok')); tr.append(h('td', 'why', x.reason || ''))
    tb.append(tr)
  })
  last.append(t, h('div', 'note', 'The router logs your model, the chosen model, effort, outcome and reason. A /model within ten minutes of a routed prompt counts as a correction.'))
  b.append(matrix, last)
  setExport('router', 'Model Router', ['You were on', 'Sent to', 'Count'], Object.keys(r.matrix).map(function (k) { var p = k.split('>'); return [cap(p[0]), cap(p[1]), String(r.matrix[k])] }).concat([['Saved, est.', '', money(r.saved)], ['Extra, est.', '', money(r.extra)], ['Corrected by you', '', String(r.corrected)]]))
}

// ---- plans ----------------------------------------------------------------------------------------------------------
function drawPlans() {
  var ev = scopeEv(), tk = scopeTasks(), b = byId('b-plans'); b.textContent = ''
  var projects = Array.from(new Set(tk.map(function (t) { return t.project }).concat(ev.map(function (e) { return e.project }))))
  if (!projects.length) return emptyBody('plans', 'Plans', 'No sessions in this period.')
  var p = planStats(ev, projects, now), withPlan = tk.filter(function (t) { return p.plans[t.project] }), cost = total(withPlan, function (t) { return t.cost })
  var chart = panel('Burn-up', 'Done and total items across projects with a plan, last 30 days',
    lines([{ pts: p.doneSeries, color: C.teal, fill: 1 }, { pts: p.totalSeries, color: C.teal, dash: 1 }], { max: Math.max.apply(null, p.totalSeries.concat([1])), label: 'Plan burn-up' }),
    row('stats3', [stat('Velocity', num1(p.velocity) + '/day', 'items done per day'), stat('Forecast', p.forecastDays == null ? '–' : dateOf(now + p.forecastDays * DAY), 'at this pace'), stat('Cost per item', p.done ? money(cost / p.done) : '–', 'tasks with a plan')]))
  var list = panel('Projects and plans', 'Without PLAN.md: ' + p.noPlan.length + ' of ' + projects.length)
  projects.sort().forEach(function (n) {
    var pl = p.plans[n], status = !pl ? tag('no plan', 'warn') : p.stalled.indexOf(n) >= 0 ? tag('stalled ' + Math.round((now - pl.lastChange) / DAY) + ' days', 'warn') : pl.done >= pl.total ? tag('done', 'ok') : tag('on track', 'ok')
    list.append(row('li', [h('span', '', labelOf(n)), h('span', 'sp'), h('span', 'mut', pl ? pl.done + ' of ' + pl.total : ''), status]))
  })
  b.append(row('g2', [chart, list]))
  setExport('plans', 'Plans', ['Project', 'Done', 'Total', 'Status'], projects.sort().map(function (n) { var pl = p.plans[n]; return [labelOf(n), pl ? String(pl.done) : '', pl ? String(pl.total) : '', !pl ? 'no plan' : p.stalled.indexOf(n) >= 0 ? 'stalled' : pl.done >= pl.total ? 'done' : 'on track'] }))
}

// ---- review and audit -----------------------------------------------------------------------------------------------
function drawRuns() {
  var r = runStats(scopeEv(), now), b = byId('b-runs'); b.textContent = ''
  if (!r.runs) return emptyBody('runs', 'Review and Audit', 'No review or audit in this period. The buttons on the band start them.')
  var panelRuns = panel('Runs per week', 'Last 12 weeks', columns(r.weekValues, { color: function () { return C.yellow }, title: function (v, i) { return v + ' runs, week of ' + r.weekKeys[i] } }),
    row('stats3', [stat('Runs', String(r.runs), r.kinds.review + ' review · ' + r.kinds.audit + ' audit'), stat('Average cost', r.avgCost == null ? '–' : money(r.avgCost), 'per run'), stat('Findings', num1(r.avgFindings), r.avgHigh == null ? 'per run' : num1(r.avgHigh) + ' must fix')]))
  var fixed = panel('Did it lead to edits?', 'Runs followed by file edits within 30 minutes', hbar('Edited after', r.fixedShare == null ? 0 : r.fixedShare * 100, 100, C.yellow, r.fixedShare == null ? '–' : pct(r.fixedShare * 100)),
    h('div', 'note', 'The journal keeps counts, not report text, so repeated finding types are not tracked.'))
  b.append(row('g2', [panelRuns, fixed]))
  setExport('runs', 'Review and Audit', ['Metric', 'Value'], [['Runs', String(r.runs)], ['Review runs', String(r.kinds.review)], ['Audit runs', String(r.kinds.audit)], ['Average cost per run', r.avgCost == null ? '' : money(r.avgCost)], ['Average findings', num1(r.avgFindings)], ['Average must-fix', num1(r.avgHigh)], ['Followed by edits, %', num1(r.fixedShare == null ? null : r.fixedShare * 100)]])
}

// ---- extras ---------------------------------------------------------------------------------------------------------
function drawExtras() {
  var ev = scopeEv(), tk = scopeTasks(), b = byId('b-extras'); b.textContent = ''
  if (!tk.length && !ev.length) return emptyBody('extras', 'Extras', 'No data in this period.')
  var x = extraStats(tk, ev, now), cards = [], rows = []
  cards.push(panel('Cache', 'Share of input read from the cache, by day', lines([{ pts: x.cacheValues, color: C.teal, fill: 1 }], { label: 'Cache share by day' })))
  var tn = x.tests.pass + x.tests.fail + x.tests.stale + x.tests.none
  cards.push(panel('Tests', 'Last known state per session', hbar('Passed', x.tests.pass, tn, C.green, String(x.tests.pass)), hbar('Failed', x.tests.fail, tn, C.red, String(x.tests.fail)), hbar('Stale', x.tests.stale, tn, C.amber, String(x.tests.stale)), hbar('Not run', x.tests.none, tn, C.blue, String(x.tests.none))))
  var mc = Object.keys(x.modelCost).sort(function (a, c) { return x.modelCost[c] - x.modelCost[a] }), mmax = x.modelCost[mc[0]] || 1
  cards.push(panel('Cost by model', 'Where the money went', mc.map(function (m) { return hbar(cap(m), x.modelCost[m], mmax, C.purple, money(x.modelCost[m])) })))
  var lt = Object.keys(x.levelTime).sort(), lmax = Math.max.apply(null, lt.map(function (k) { return x.levelTime[k] }).concat([1]))
  cards.push(panel('Time per Ponytail level', 'Agent time by the level the session ran on', lt.map(function (k) { return hbar(cap(k), x.levelTime[k], lmax, C.green, dur(Math.round(x.levelTime[k]))) })))
  var gmax = Math.max.apply(null, [].concat.apply([], x.grid).concat([1])), heat = h('div', 'hm')
  x.grid.forEach(function (rowv, d) { rowv.forEach(function (v, hr) { var c = h('i'); c.style.background = v ? C.purple : ''; c.style.opacity = v ? String(.25 + .75 * v / gmax) : ''; c.title = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d] + ' ' + hr + ':00, ' + v + ' turns'; heat.append(c) }) })
  cards.push(panel('When you work', 'Turns by weekday (Mon to Sun, top to bottom) and hour', heat))
  var top = panel('Most expensive sessions', 'Outliers are more than two deviations above the mean')
  x.top.forEach(function (t) { top.append(row('li', [h('span', '', t.name.slice(0, 40)), t.outlier ? tag('outlier', 'warn') : null, h('span', 'sp'), h('span', 'num', money(t.cost))])) })
  cards.push(top)
  cards.push(panel('Quality signals', 'From the journal', row('stats2', [stat('Push backs', x.corrections == null ? '–' : num1(x.corrections) + ' per 100', 'short replies like "no" or "wrong" of ' + x.prompts + ' prompts'), stat('Compactions', String(x.compactions), x.compactCtx == null ? '' : 'at ' + num1(x.compactCtx) + '% context on average'), stat('Subagent turns', String(x.agents), tok(x.agentTokens) + ' tokens')])))
  b.append(row('g2', cards))
  rows.push(['Cache hit, last day %', num1(x.cacheValues[x.cacheValues.length - 1])], ['Sessions with passed tests', String(x.tests.pass)], ['Sessions with failed tests', String(x.tests.fail)], ['Push backs per 100 prompts', num1(x.corrections)], ['Compactions', String(x.compactions)], ['Subagent turns', String(x.agents)], ['Subagent tokens', String(x.agentTokens)])
  mc.forEach(function (m) { rows.push(['Cost, ' + cap(m), money(x.modelCost[m])]) }); lt.forEach(function (k) { rows.push(['Agent minutes, level ' + k, String(Math.round(x.levelTime[k]))]) })
  x.top.forEach(function (t, i) { rows.push(['Expensive session ' + (i + 1), t.name + ' (' + money(t.cost) + ')']) })
  setExport('extras', 'Extras', ['Metric', 'Value'], rows)
}

// The numbers the share card carries beside the hero: projects, activity, reuse, router, plans and reviews.
function cardTiles(list, cur) {
  var cats = categorize(cur, EV, CFG).filter(function (p) { return p.name !== 'Chats' }), large = cats.filter(function (p) { return p.category === 'Large' }).length
  var vals = perDay(list, days(84), METRICS.time.pick), active = vals.filter(function (v) { return v > 0 }).length, streak = 0, by = {}
  for (var j = vals[83] > 0 ? 83 : 82; j >= 0 && vals[j] > 0; j--) streak++
  cur.forEach(function (t) { var k = t.started.slice(0, 10); by[k] = (by[k] || 0) + t.agentMinutes })
  var busiest = Object.keys(by).sort(function (a, b) { return by[b] - by[a] })[0], re = cur.filter(function (t) { return t.reuse != null }).map(function (t) { return t.reuse })
  var ev = scopeEv(), r = routerStats(scopeAud(), ev), pl = planStats(ev, cats.map(function (p) { return p.name }), now), rs = runStats(ev, now)
  function put(id, v) { byId(id).textContent = v }
  put('c-projects', cats.length + (large ? ' · ' + large + ' large' : ''))
  put('c-active', active + ' of 84 days'); put('c-streak', plural(streak, 'day')); put('c-busiest', busiest ? shortDate(busiest) + ' · ' + time(by[busiest] * 60000) : '–')
  put('c-reuse', re.length ? Math.round(mean(re)) + '%' : '–'); put('c-router', r.total ? Math.round(r.stayed / r.total * 100) + '% kept' : '–')
  put('c-plan', pl.velocity ? num1(pl.velocity) + ' items/day' : '–'); put('c-runs', rs.runs ? plural(rs.runs, 'run') : '–')
}

// One page at a time: the nav and the remembered choice follow it.
function showPage(id) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-page') === id) })
  document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === id) })
  try { localStorage.setItem('ponytail-board-page', id) } catch (e) {}
  window.scrollTo(0, 0)
  if (id === 'overview') chart()
}
// PDF through the browser's print dialog ("Save as PDF"): only the chosen pages, in the light theme, put back afterwards.
function printIds(ids) {
  var pages = document.querySelectorAll('.page'), theme = document.documentElement.getAttribute('data-theme')
  pages.forEach(function (p) { p.classList.toggle('print-skip', ids.indexOf(p.getAttribute('data-page')) < 0) })
  document.documentElement.setAttribute('data-theme', 'light')
  window.onafterprint = function () { pages.forEach(function (p) { p.classList.remove('print-skip') }); document.documentElement.setAttribute('data-theme', theme); window.onafterprint = null }
  window.print()
}

function renderSections() { drawOverviewExport(); drawProjects(); drawContext(); drawReuse(); drawRouter(); drawPlans(); drawRuns(); drawExtras() }

// ---- export ---------------------------------------------------------------------------------------------------------
function mask(text, on) {
  if (!on) return text
  var all = Array.from(new Set(tasks.map(function (t) { return t.project }).concat(EV.map(function (e) { return e.project })))).sort(function (a, c) { return c.length - a.length })
  all.forEach(function (n, i) { if (n) text = text.split(labelOf(n)).join('Project ' + (i + 1)); if (n && labelOf(n) !== n) text = text.split(n).join('Project ' + (i + 1)) })
  return text
}
function toMd(e) {
  var out = ['## ' + e.title, '']
  if (e.rows.length) { out.push('| ' + e.headers.join(' | ') + ' |', '| ' + e.headers.map(function () { return '---' }).join(' | ') + ' |'); e.rows.forEach(function (r) { out.push('| ' + r.join(' | ') + ' |') }) } else out.push('No data.')
  return out.join(NL)
}
function toCsv(e) {
  function q(v) { v = String(v); return v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf(NL) >= 0 ? '"' + v.split('"').join('""') + '"' : v }
  return [e.headers].concat(e.rows).map(function (r) { return r.map(q).join(',') }).join(NL)
}
function stamp() { return dkey(now) + ' · ' + (state.project ? labelOf(state.project) : 'All projects') + ' · ' + (state.period ? 'last ' + state.period + ' days' : 'all time') }
function allMd(ids, hide) { return mask(['# Ponytail board', '', stamp(), ''].concat(ids.map(function (id) { return toMd(EXPORTS[id]) + NL })).join(NL), hide) }
function saveText(text, name, type) { download(new Blob([text], { type: type }), name) }
function saveSection(id, fmt) {
  var e = EXPORTS[id] || { title: id, headers: [], rows: [] }
  if (fmt === 'md') saveText(mask(toMd(e), false), 'board-' + id + '.md', 'text/markdown')
  else if (fmt === 'csv') saveText(toCsv(e), 'board-' + id + '.csv', 'text/csv')
  else if (fmt === 'pdf') printIds([id])
  else saveText(JSON.stringify({ scope: stamp(), section: e }, null, 2), 'board-' + id + '.json', 'application/json')
}
function copyText(text, btn, done) {
  function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy') } catch (e) {} t.remove() }
  try { navigator.clipboard.writeText(text).catch(fallback) } catch (e) { fallback() }
  var was = btn.textContent; btn.textContent = done; setTimeout(function () { btn.textContent = was }, 1500)
}
function summaryMd() { return allMd(['overview', 'projects', 'context', 'router', 'plans'].filter(function (id) { return EXPORTS[id] && EXPORTS[id].rows.length }), false) }
function closeMenus() { document.querySelectorAll('.menu').forEach(function (m) { m.hidden = true }) }
function wireExport() {
  document.querySelectorAll('[data-export]').forEach(function (btn) {
    var id = btn.getAttribute('data-export'), menu = h('div', 'menu'); menu.hidden = true
    ;[['PDF', 'pdf'], ['Markdown', 'md'], ['CSV', 'csv'], ['JSON', 'json']].forEach(function (f) { var m = h('button', '', f[0]); m.type = 'button'; m.addEventListener('click', function () { menu.hidden = true; saveSection(id, f[1]) }); menu.append(m) })
    btn.parentNode.append(menu)
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); var open = menu.hidden; closeMenus(); menu.hidden = !open })
  })
  document.addEventListener('click', closeMenus)
  document.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { showPage(b.getAttribute('data-tab')) }) })
  byId('back').addEventListener('click', function () { state.project = ''; state.hidden = {}; render() })
  var saved = 'overview'
  try { saved = localStorage.getItem('ponytail-board-page') || 'overview' } catch (e) {}
  showPage(document.querySelector('.page[data-page="' + saved + '"]') ? saved : 'overview')
  byId('copy-summary').addEventListener('click', function (e) { copyText(summaryMd(), e.target, 'Copied') })
  var dlg = byId('export-dialog'), list = byId('export-list')
  ;['overview', 'projects', 'context', 'reuse', 'router', 'plans', 'runs', 'extras'].forEach(function (id) {
    var l = h('label', 'li'), c = h('input'); c.type = 'checkbox'; c.checked = true; c.value = id
    l.append(c, h('span', '', (EXPORTS[id] ? EXPORTS[id].title : id))); list.append(l)
  })
  function chosen() { return Array.from(list.querySelectorAll('input')).filter(function (c) { return c.checked }).map(function (c) { return c.value }) }
  byId('export-all').addEventListener('click', function () { dlg.showModal() })
  byId('export-close').addEventListener('click', function () { dlg.close() })
  byId('export-pdf').addEventListener('click', function () { dlg.close(); printIds(chosen()) })
  byId('export-md').addEventListener('click', function () { saveText(allMd(chosen(), byId('hide-names').checked), 'ponytail-board.md', 'text/markdown') })
  byId('export-json').addEventListener('click', function () { saveText(mask(JSON.stringify({ scope: stamp(), sections: chosen().map(function (id) { return EXPORTS[id] }) }, null, 2), byId('hide-names').checked), 'ponytail-board.json', 'application/json') })
  byId('export-copy').addEventListener('click', function (e) { copyText(allMd(chosen(), byId('hide-names').checked), e.target, 'Copied') })
}
`
