// Motion for the Board, in plain CSS and a few lines of script. Three levels, switched in the sidebar and remembered:
// Off (nothing moves), Subtle (short fades, bars and lines that draw in, menus that pop) and Rich (adds staggered entrances,
// counting numbers, a honeycomb that pops in and glows, a sliding nav mark, hover lifts). Only transform and opacity move,
// apart from the clip-path of a line chart that draws in. The system setting "reduce motion" always wins.
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

/* Subtle and Rich */
html:not([data-motion="off"]) .page.on{animation:bd-fade .24s var(--ease) both}
html:not([data-motion="off"]) .cols i{transform-origin:bottom;animation:bd-grow-y .6s var(--ease) both;animation-delay:calc(var(--i,0) * 30ms)}
html:not([data-motion="off"]) .hbar i{transform-origin:left;animation:bd-grow-x .7s var(--ease) both}
html:not([data-motion="off"]) .lines,html:not([data-motion="off"]) .spark,html:not([data-motion="off"]) #stream{animation:bd-fade .5s var(--ease) both}
html:not([data-motion="off"]) #heat .cell-empty,html:not([data-motion="off"]) #heat path{animation:bd-fade .5s var(--ease) both;animation-delay:var(--d,0ms)}
html:not([data-motion="off"]) .menu:not([hidden]){transform-origin:top right;animation:bd-pop .14s var(--ease) both}
html:not([data-motion="off"]) .picker .menu:not([hidden]){transform-origin:top left}
html:not([data-motion="off"]) dialog[open]{animation:bd-pop .2s var(--ease) both}
html:not([data-motion="off"]) dialog[open]::backdrop{animation:bd-fade .2s both}
html:not([data-motion="off"]) .btn,html:not([data-motion="off"]) .grp button,html:not([data-motion="off"]) .seg button,html:not([data-motion="off"]) .nav-item,html:not([data-motion="off"]) .chip{transition:background .18s var(--ease),color .18s var(--ease),border-color .18s var(--ease),transform .12s var(--ease)}
html:not([data-motion="off"]) .btn:active,html:not([data-motion="off"]) .grp button:active,html:not([data-motion="off"]) .seg button:active{transform:scale(.97)}
html:not([data-motion="off"]) .theme svg{transition:transform .3s var(--ease)}
html:not([data-motion="off"]) .theme:active svg{transform:rotate(60deg)}
html:not([data-motion="off"]) .tip{animation:bd-fade .12s both}

/* Rich only */
html[data-motion="rich"] .page.on>*{animation:bd-rise .55s var(--ease) both;animation-delay:calc(var(--i,0) * 70ms)}
html[data-motion="rich"] .kpi{animation:bd-rise .6s var(--ease) both;animation-delay:calc(var(--i,0) * 80ms)}
html[data-motion="rich"] .g2>*,html[data-motion="rich"] .g3>*,html[data-motion="rich"] .pcat>.tile,html[data-motion="rich"] .heroes>*,html[data-motion="rich"] .stats2>*,html[data-motion="rich"] .stats3>*,html[data-motion="rich"] .stats4>*{animation:bd-rise .5s var(--ease) both;animation-delay:calc(var(--i,0) * 60ms)}
html[data-motion="rich"] .lines,html[data-motion="rich"] .spark,html[data-motion="rich"] #stream{animation:bd-reveal 1s var(--ease) both;animation-delay:.12s}
html[data-motion="rich"] #heat path{transform-box:fill-box;transform-origin:center;animation:bd-pop .5s var(--ease) both;animation-delay:var(--d,0ms)}
html[data-motion="rich"] #heat .cell-empty{animation:bd-fade .5s var(--ease) both;animation-delay:var(--d,0ms)}
html[data-motion="rich"] #heat .glow-cell{animation:bd-glow 3.4s ease-in-out 1s infinite}
html[data-motion="rich"] .mx td{animation:bd-pop .45s var(--ease) both;animation-delay:calc(var(--i,0) * 40ms)}
html[data-motion="rich"] .proj,html[data-motion="rich"] .li{animation:bd-rise .45s var(--ease) both;animation-delay:calc(var(--i,0) * 30ms)}
html[data-motion="rich"] #sections .nav-item{animation:bd-rise .5s var(--ease) both;animation-delay:calc(var(--i,0) * 45ms)}
html[data-motion="rich"] .nav-item{position:relative}
html[data-motion="rich"] .nav-item.on::before{content:"";position:absolute;left:0;top:26%;bottom:26%;width:3px;border-radius:2px;background:var(--text);transform-origin:center;animation:bd-grow-y .3s var(--ease) both}
html[data-motion="rich"] .kpi,html[data-motion="rich"] .tile,html[data-motion="rich"] .panel{transition:transform .25s var(--ease),border-color .25s var(--ease),box-shadow .25s var(--ease)}
html[data-motion="rich"] .kpi:hover,html[data-motion="rich"] .tile:hover,html[data-motion="rich"] .panel:hover{transform:translateY(-3px);border-color:var(--line2)}
html[data-motion="rich"] .proj{transition:background .18s,transform .2s var(--ease)}html[data-motion="rich"] .proj:hover{transform:translateX(3px)}

.motion{border:0;background:transparent;color:var(--muted);font:inherit;font-size:12px;padding:6px 8px;border-radius:9px;cursor:pointer;white-space:nowrap}.motion:hover{background:var(--track);color:var(--text)}

@media (prefers-reduced-motion:reduce){html *,html *::before,html *::after{animation:none!important;transition:none!important}}
@media print{html *{animation:none!important;transition:none!important}}
`

export const MOTION_JS = `
var MOTION_MODES = ['off', 'subtle', 'rich']
function motionNow() { return document.documentElement.getAttribute('data-motion') }
function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) }
// Numbers count up from zero in Rich mode; the last frame is always the exact value.
function animateNumber(node, to, fmt) {
  if (!node || motionNow() !== 'rich' || reducedMotion() || !window.requestAnimationFrame) return
  var t0 = null, done = false
  // A timer sets the exact value even if the browser never runs a frame (a hidden tab), so the number can not stay at zero.
  function finish() { if (!done) { done = true; node.nodeValue = fmt(to) } }
  function step(ts) {
    if (done) return
    if (t0 === null) t0 = ts
    var p = Math.min(1, (ts - t0) / 800)
    if (p >= 1) return finish()
    node.nodeValue = fmt(to * (1 - Math.pow(1 - p, 3)))
    window.requestAnimationFrame(step)
  }
  node.nodeValue = fmt(0)
  window.requestAnimationFrame(step)
  setTimeout(finish, 950)
}
// The index of each child among its siblings, for the staggered entrances.
function stagger() {
  ;['.page.on', '.kpis', '.pcat', '.g2', '.g3', '.stats2', '.stats3', '.stats4', '.heroes', '.cols', '.hm', '#sections', '#b-projects', '.panel'].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (c) { Array.from(c.children || []).forEach(function (k, i) { if (k.style) k.style.setProperty('--i', i) }) })
  })
  Array.from(document.querySelectorAll('.mx td')).forEach(function (td, i) { td.style.setProperty('--i', i) })
}
function applyMotion(mode) {
  document.documentElement.setAttribute('data-motion', mode)
  var b = byId('motion'); b.textContent = 'Motion: ' + cap(mode); b.setAttribute('aria-label', 'Motion: ' + mode + (reducedMotion() ? ' (your system asks for reduced motion, so nothing moves)' : '') + ', switch to ' + MOTION_MODES[(MOTION_MODES.indexOf(mode) + 1) % 3])
}
function initMotion() {
  var saved = ''
  try { saved = localStorage.getItem('ponytail-board-motion') || '' } catch (e) {}
  applyMotion(MOTION_MODES.indexOf(saved) >= 0 ? saved : 'rich')
  byId('motion').addEventListener('click', function () {
    var next = MOTION_MODES[(MOTION_MODES.indexOf(motionNow()) + 1) % 3]
    applyMotion(next)
    try { localStorage.setItem('ponytail-board-motion', next) } catch (e) {}
    render()
  })
}
`
