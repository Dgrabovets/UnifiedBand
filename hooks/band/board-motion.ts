// Motion for the Board, in plain CSS and a few lines of script. It is always on, at one rich level;
// the system setting "reduce motion" turns all of it off.
// Only transform and opacity move, apart from the clip-path of a chart that draws in and the shape of the main chart
// morphing between metrics. Entrance animations use fill-mode "backwards": once one ends the element is plain again,
// not held on a compositing layer, which is what made text look soft.
// No backticks, template placeholders or backslashes inside the script text: it sits in a template literal.

export const MOTION_CSS = `
:root{--ease:cubic-bezier(.2,.7,.2,1)}
@keyframes bd-fade{from{opacity:0}to{opacity:1}}
@keyframes bd-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes bd-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes bd-grow-y{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes bd-grow-x{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes bd-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes bd-glow{0%,100%{opacity:.25}50%{opacity:.75}}
@keyframes bd-hot{0%,100%{opacity:.12}50%{opacity:.95}}
@keyframes bd-confetti{0%{opacity:1;transform:translate(0,0) rotate(0)}65%{opacity:1}100%{opacity:0;transform:translate(var(--dx),calc(var(--dy) + 90px)) rotate(var(--rot))}}

/* Entrances */
.page.on{animation:bd-fade .24s var(--ease) backwards}
.page.on>*{animation:bd-rise .55s var(--ease) backwards;animation-delay:calc(var(--i,0) * 70ms)}
.kpi{animation:bd-rise .6s var(--ease) backwards;animation-delay:calc(var(--i,0) * 80ms)}
.g2>*,.g3>*,.heroes>*,.stats2>*,.stats3>*,.stats4>*{animation:bd-rise .5s var(--ease) backwards;animation-delay:calc(var(--i,0) * 60ms)}
.cols i{transform-origin:bottom;animation:bd-grow-y .6s var(--ease) backwards;animation-delay:calc(var(--i,0) * 30ms)}
.hbar i{transform-origin:left;animation:bd-grow-x .7s var(--ease) backwards}
.lines,.spark,#stream{animation:bd-reveal 1s var(--ease) backwards;animation-delay:.12s}
#heat path{transform-box:fill-box;transform-origin:center;animation:bd-pop .5s var(--ease) backwards;animation-delay:var(--d,0ms)}
#heat .cell-empty{animation:bd-fade .5s var(--ease) backwards;animation-delay:var(--d,0ms)}
#heat .glow-cell{animation:bd-glow 3.4s ease-in-out 1s infinite}
.mx td{animation:bd-pop .45s var(--ease) backwards;animation-delay:calc(var(--i,0) * 40ms)}
.li,.prow{animation:bd-rise .45s var(--ease) backwards;animation-delay:calc(var(--i,0) * 30ms)}
#sections .nav-item{animation:bd-rise .5s var(--ease) backwards;animation-delay:calc(var(--i,0) * 45ms)}
.nav-item{position:relative}
.nav-item.on::before{content:"";position:absolute;left:0;top:26%;bottom:26%;width:3px;border-radius:2px;background:var(--text);animation:bd-grow-y .3s var(--ease) backwards}
.menu:not([hidden]){transform-origin:top right;animation:bd-pop .14s var(--ease) backwards}
.picker .menu:not([hidden]){transform-origin:top left}
dialog[open]{animation:bd-pop .2s var(--ease) backwards}
dialog[open]::backdrop{animation:bd-fade .2s backwards}
.tip{animation:bd-fade .12s backwards}

/* The share card assembles itself each time it opens: the nodes rise in turn, the stream draws in last */
#card.assemble>text,#card.assemble>use,#card.assemble>line{animation:bd-rise .55s var(--ease) backwards;animation-delay:var(--k,0ms)}
#card.assemble #c-stream{animation:bd-reveal 1.1s var(--ease) .4s backwards}

/* Answers to the pointer: no transforms on text, so text stays sharp */
.btn,.grp button,.seg button,.nav-item{transition:background .18s var(--ease),color .18s var(--ease),border-color .18s var(--ease)}
.btn:active,.grp button:active,.seg button:active{transform:scale(.97)}
.theme svg{transition:transform .3s var(--ease)}.theme:active svg{transform:rotate(60deg)}
.kpi,.panel,.chart-card,.heat{position:relative;transition:border-color .25s var(--ease)}
.kpi:hover,.panel:hover{border-color:var(--line2)}
.kpi::before,.panel::before,.chart-card::before,.heat::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;opacity:0;transition:opacity .3s var(--ease);background:radial-gradient(280px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.075),transparent 65%)}
.kpi:hover::before,.panel:hover::before,.chart-card:hover::before,.heat:hover::before{opacity:1}
:root[data-theme=light] .kpi::before,:root[data-theme=light] :root[data-theme=light] .panel::before,:root[data-theme=light] .chart-card::before,:root[data-theme=light] .heat::before{background:radial-gradient(280px circle at var(--mx,50%) var(--my,50%),rgba(0,0,0,.05),transparent 65%)}
.panel>*,.chart-card>*,.heat>*{position:relative;z-index:1}

/* A limit close to its end: a red ring that breathes */
.panel.hot::after{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;box-shadow:0 0 0 1px rgba(224,96,90,.6),0 0 22px rgba(224,96,90,.35);animation:bd-hot 2.2s ease-in-out infinite}

/* Numbers roll like a departures board: every character sits in a box one line tall, digits in a strip of ten */
.digit,.ch{display:inline-block;height:1.25em;line-height:1.25em;vertical-align:top}
.ch{white-space:pre}
.digit{overflow:hidden}
.strip{display:block;transition:transform .9s var(--ease)}
.strip>span{display:block;height:1.25em;line-height:1.25em}

/* A streak of a week or more throws confetti once */
.heroes{position:relative}
.confetti{position:absolute;left:75%;top:30%;width:0;height:0;pointer-events:none;z-index:3}
.confetti i{position:absolute;width:7px;height:11px;border-radius:2px;animation:bd-confetti 1.7s cubic-bezier(.2,.7,.3,1) forwards}

@media (prefers-reduced-motion:reduce){html *,html *::before,html *::after{animation:none!important;transition:none!important}}
@media print{html *{animation:none!important;transition:none!important}.confetti{display:none}}
`

export const MOTION_JS = `
var morphNext = false, prevD = [], celebrated = false, lastStreak = 0
function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) }

// ---- rolling numbers ------------------------------------------------------------------------------------------------
// The text node becomes one box per character; a digit is a strip of 0 to 9 that slides to its value, left to right.
function rollNode(node) {
  var host = node && node.parentNode, text = node && node.nodeValue
  if (!host || !text || reducedMotion()) return
  var frag = document.createDocumentFragment(), digits = []
  host.setAttribute('data-roll', text); host.setAttribute('aria-label', text)
  text.split('').forEach(function (ch) {
    if (ch >= '0' && ch <= '9') {
      var d = h('span', 'digit'), strip = h('span', 'strip')
      for (var n = 0; n < 10; n++) strip.append(h('span', '', String(n)))
      strip.setAttribute('data-to', ch); d.setAttribute('aria-hidden', 'true'); d.append(strip); frag.append(d); digits.push(strip)
    } else { var c = h('span', 'ch', ch); c.setAttribute('aria-hidden', 'true'); frag.append(c) }
  })
  host.insertBefore(frag, node); host.removeChild(node)
  settleDigits(digits)
}
function settleDigits(strips) {
  setTimeout(function () { strips.forEach(function (s, i) { s.style.transitionDelay = i * 55 + 'ms'; s.style.transform = 'translateY(' + (-(+s.getAttribute('data-to')) * 1.25) + 'em)' }) }, 40)
}
function rollAll() {
  document.querySelectorAll('.kpi-value, #chart-total, .hero-value, .stat-v').forEach(function (el) {
    var n = el.firstChild
    if (n && n.nodeType === 3) rollNode(n)
  })
}
// A page that was hidden when its numbers settled rolls them again when it is shown.
function replayRoll(page) {
  if (!page || reducedMotion()) return
  var strips = Array.from(page.querySelectorAll('.strip'))
  strips.forEach(function (s) { s.style.transition = 'none'; s.style.transform = 'translateY(0)' })
  void page.getBoundingClientRect()
  strips.forEach(function (s) { s.style.transition = '' })
  settleDigits(strips)
}

// ---- the main chart morphs between metrics ------------------------------------------------------------------------------
function morph(el, from, to) {
  if (!from || from === to || from.replace(/[0-9.,-]+/g, '#') !== to.replace(/[0-9.,-]+/g, '#')) return
  el.animate([{ d: 'path("' + from + '")' }, { d: 'path("' + to + '")' }], { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)' })
}
function morphStream(box) {
  var paths = Array.from(box.querySelectorAll('path')), ds = paths.map(function (p) { return p.getAttribute('d') })
  if (morphNext && !reducedMotion() && prevD.length === ds.length && paths.length && paths[0].animate) paths.forEach(function (p, i) { morph(p, prevD[i], ds[i]) })
  prevD = ds; morphNext = false
}

// ---- confetti, share card, pointer glow ------------------------------------------------------------------------------
function celebrate() {
  if (celebrated || lastStreak < 7 || reducedMotion()) return
  var box = document.querySelector('.heroes')
  if (!box) return
  celebrated = true
  var wrap = h('div', 'confetti')
  wrap.setAttribute('aria-hidden', 'true')
  for (var i = 0; i < 36; i++) {
    var p = h('i'), a = Math.PI * 2 * i / 36 + Math.random() * .4, r = 70 + Math.random() * 120
    p.style.setProperty('--dx', Math.round(Math.cos(a) * r) + 'px'); p.style.setProperty('--dy', Math.round(Math.sin(a) * r - 40) + 'px')
    p.style.setProperty('--rot', Math.round(Math.random() * 540 - 270) + 'deg'); p.style.background = PALETTE[i % PALETTE.length]
    p.style.animationDelay = Math.round(Math.random() * 120) + 'ms'; wrap.append(p)
  }
  box.append(wrap)
  setTimeout(function () { if (wrap.remove) wrap.remove() }, 2300)
}
function assembleCard() {
  var c = byId('card')
  if (!c || reducedMotion()) return
  Array.from(c.children).forEach(function (k, i) { if (k.style) k.style.setProperty('--k', i * 45 + 'ms') })
  c.classList.remove('assemble'); void c.getBoundingClientRect(); c.classList.add('assemble')
}
function pointerGlow() {
  document.addEventListener('pointermove', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.kpi, .panel, .chart-card, .heat') : null
    if (!t) return
    var r = t.getBoundingClientRect()
    t.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px'); t.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px')
  })
}

// The index of each child among its siblings, for the staggered entrances.
function stagger() {
  ;['.page.on', '.kpis', '.g2', '.g3', '.stats2', '.stats3', '.stats4', '.heroes', '.cols', '.hm', '#sections', '#b-projects', '.panel'].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (c) { Array.from(c.children || []).forEach(function (k, i) { if (k.style) k.style.setProperty('--i', i) }) })
  })
  Array.from(document.querySelectorAll('.mx td')).forEach(function (td, i) { td.style.setProperty('--i', i) })
}
function initMotion() { pointerGlow() }
`
