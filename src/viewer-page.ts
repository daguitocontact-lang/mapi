
const LEGEND_HTML = '<b>1 · 2 · 3</b> read in order · <b>2a / 2b</b> alternative paths<br><b>bold line</b> story · <b>faint line</b> context<br><b>pill</b> person · <b>box</b> step or data (its logo says which) · <b>diamond</b> decision (yes / no)<br><b>double border</b> external service<br><b>dashed</b> optional / fallback · <b>stack</b> has detail: double-click<br><b>corner arrow</b> opens another map'

// Prototype preview page (single self-contained HTML, no build step);
// this stays a throwaway shell so iterating on the renderer needs no app build.
// Infinite canvas like Excalidraw: drag to pan, wheel to pan, pinch/⌘+wheel to zoom.
// Click selects a shape (info panel), double-click drills into a group.
export function viewerPage(file: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mapi · ${file}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--libw:300px;--panelw:340px;--surface:rgba(255,255,255,.92);--line:rgba(0,0,0,.08);--hover:rgba(0,0,0,.04);--chip:#f2f2f2;--strong:#0a0a0a;--strong-inv:#fafafa;--text:#171717;--muted:#6b6b6b;--faint:#a3a3a3;--glow:rgba(0,0,0,.3)}
#nav,#toolbar,#steps,#panel,#status,#issueList{box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06)}

html,body{margin:0;height:100%;overflow:hidden;color:var(--text);font:400 13px/1.4 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
#trail button{background:none;border:none;padding:2px 4px;color:var(--muted)}#trail button:last-child{color:var(--text)}
#stage{position:fixed;inset:0;cursor:grab;touch-action:none;user-select:none}
#stage.dragging{cursor:grabbing}
#world.focusing g[data-from]:not(.hl){opacity:.1}#world.focusing g[data-id]:not(.hl){opacity:.22}#world g[data-from],#world g[data-id]{transition:opacity .2s cubic-bezier(.2,0,0,1)}
#panel .conn{margin:6px 0 2px;font:600 11px Inter;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}#panel .conn+ul{margin:0;padding-left:16px}#panel li{margin:2px 0}
#world g.moving{opacity:.75;cursor:grabbing}
#world g.sel{filter:drop-shadow(0 0 5px var(--glow)) drop-shadow(0 0 2px var(--glow))}
#panel{position:fixed;left:var(--libw);bottom:12px;min-width:240px;max-width:340px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;display:none;z-index:2;line-height:1.5}
#panel.open{display:block}#panel h3{margin:0 0 6px;font:600 15px Outfit,system-ui}#panel code{background:var(--chip);padding:1px 6px;border-radius:6px}#panel .muted{color:var(--muted)}#panel button{margin-top:8px}
#steps{position:fixed;transition:transform .25s cubic-bezier(.2,0,0,1),opacity .25s cubic-bezier(.2,0,0,1);position:fixed;top:12px;right:12px;bottom:12px;width:300px;overflow:auto;padding:22px 20px;background:var(--surface);border:1px solid var(--line);border-radius:16px;z-index:2}
#steps .eyebrow{font:600 11px/1 Inter;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:0 0 10px}
#steps h2{margin:0 0 10px;font:700 21px/1.2 Outfit,system-ui;letter-spacing:-.01em;color:var(--text)}
#steps .idea{font:400 14px/1.6 Inter;color:var(--muted);margin:0 0 22px;padding-bottom:20px;border-bottom:1px solid var(--line)}
#steps ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
#steps li{display:flex;gap:12px;padding:10px;border-radius:10px;cursor:pointer;transition:background .2s cubic-bezier(.2,0,0,1)}
#steps li:hover{background:var(--hover)}#steps li.on{background:var(--line)}
#steps .n{flex:none;min-width:24px;padding:0 4px;box-sizing:border-box;height:24px;margin-top:1px;border-radius:100px;background:var(--strong);color:var(--strong-inv);font:600 12px/24px Inter;text-align:center;font-variant-numeric:tabular-nums}
#steps .who{font:500 14px/1.4 Inter;color:var(--text)}#steps .who span{color:var(--faint);font-weight:400;padding:0 4px}
#steps .what{font:400 13px/1.45 Inter;color:var(--muted);margin-top:2px}
#steps .more{margin-top:6px;background:none;border:1px solid var(--line);color:var(--text);font:500 12px Inter;padding:3px 10px;border-radius:100px;cursor:pointer}#steps .more:hover{background:var(--line)}
#steps li.sub{padding-left:30px}#steps li.sub .n{background:transparent;border:1.5px solid var(--faint);color:var(--muted)}#steps li.sub .who{font-weight:400;color:var(--muted)}
#steps .cgroup{margin:18px 0 6px;font:600 11px Inter;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
#steps .comp{padding:8px 10px;border-radius:10px;cursor:pointer}#steps .comp:hover{background:var(--hover)}
#steps .cname{font:500 13.5px/1.35 Inter;color:var(--text)}#steps .cabout{font:400 12.5px/1.5 Inter;color:var(--muted);margin-top:2px}
#steps .empty{color:var(--faint);font-size:13px}

#world g.dim{opacity:.18;transition:opacity .25s cubic-bezier(.2,0,0,1)}
#world g.gone{opacity:.06;transition:opacity .25s cubic-bezier(.2,0,0,1)}
#steps li.gone{display:none}
#branch{display:none}#branch.on{display:inline-flex;gap:6px;align-items:center}
#rulerX,#rulerY{position:fixed;z-index:1;pointer-events:none;font:500 11px ui-monospace,Menlo,monospace;color:var(--faint)}
#rulerX{left:calc(var(--libw) + 8px);right:var(--panelw);top:0;height:18px;overflow:hidden}#rulerY{top:64px;bottom:64px;left:calc(var(--libw) - 6px);width:22px;overflow:hidden}
#rulerX span,#rulerY span{position:absolute;padding:2px 4px}
#status{position:fixed;left:var(--libw);bottom:12px;z-index:2;padding:6px 12px;background:var(--surface);border:1px solid var(--line);border-radius:100px;font:500 12px ui-monospace,Menlo,monospace;color:var(--text)}
#panel{bottom:52px !important}
button,select{font:500 13px Inter,system-ui,sans-serif;color:var(--text);cursor:pointer}
#nav{position:fixed;top:12px;left:var(--libw);display:flex;gap:8px;align-items:center;padding:6px;background:var(--surface);border:1px solid var(--line);border-radius:100px;backdrop-filter:blur(10px);z-index:3}
#nav b{font:700 15px Outfit,system-ui;padding:0 6px 0 4px;color:var(--text)}
#nav select{appearance:none;background:var(--chip) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23a3a3a3' fill='none' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 12px center;border:1px solid var(--line);border-radius:100px;padding:6px 30px 6px 14px}
.ghost{background:none;border:none;padding:6px 10px;border-radius:100px;color:var(--muted)}.ghost:hover{background:var(--hover);color:var(--text)}
#trail{display:flex;align-items:center;color:var(--faint)}
#trail button{background:none;border:none;padding:4px 6px;border-radius:8px;color:var(--muted)}#trail button:hover{background:var(--hover)}#trail button:last-child{color:var(--text)}
.chip{border-radius:100px;padding:5px 12px;font-size:12px;border:1px solid var(--line);background:var(--chip);color:var(--text)}
.chip.err{border-color:#f8717166;color:#fca5a5;background:#f871711a}.chip:empty{display:none}
#issueList{display:none;position:absolute;top:calc(100% + 8px);left:0;min-width:320px;max-width:520px;padding:10px 14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;font:400 12px/1.7 ui-monospace,Menlo,monospace;color:var(--muted)}
#issueList.open{display:block}
#toolbar{position:fixed;bottom:12px;left:calc(var(--libw) + (100vw - var(--libw) - var(--panelw)) / 2);transform:translateX(-50%);max-width:calc(100vw - var(--libw) - var(--panelw) - 16px);overflow-x:auto;white-space:nowrap;scrollbar-width:none;display:flex;align-items:center;gap:4px;padding:6px;background:var(--surface);border:1px solid var(--line);border-radius:100px;backdrop-filter:blur(10px);z-index:3}
#toolbar button{white-space:nowrap;flex:none;background:none;border:none;border-radius:100px;padding:7px 12px;color:var(--muted);transition:background .2s cubic-bezier(.2,0,0,1),color .2s cubic-bezier(.2,0,0,1)}
#toolbar button:hover{background:var(--hover);color:var(--text)}
#toolbar .sep{width:1px;height:20px;background:var(--line);margin:0 4px}
#toolbar #fit{font-variant-numeric:tabular-nums;min-width:58px}
#toolbar .primary{background:var(--strong);color:var(--strong-inv);font-weight:600}#toolbar .primary:hover{opacity:.88;background:var(--strong);color:var(--strong-inv)}
#steps .legend{margin-top:22px;padding-top:16px;border-top:1px solid var(--line);font:400 12px/1.8 Inter;color:var(--faint)}#steps .legend b{color:var(--text);font-weight:500}
/* Mapi's own select: button + popover list, keyboard navigable */
.mselect{position:relative}
.mselect>button{display:flex;align-items:center;gap:8px;background:var(--chip);border:1px solid var(--line);border-radius:100px;padding:6px 12px 6px 14px;color:var(--text)}
.mselect>button:after{content:'';width:7px;height:7px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:translateY(-2px) rotate(45deg);margin-left:2px}
.mselect ul{display:none;position:absolute;top:calc(100% + 6px);left:0;min-width:100%;margin:0;padding:6px;list-style:none;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:5;max-height:60vh;overflow:auto}
.mselect.open ul{display:block}
.mselect li{padding:8px 12px;border-radius:8px;white-space:nowrap;cursor:pointer;color:var(--text)}
.mselect li.active,.mselect li:hover{background:var(--hover)}.mselect li.on{font-weight:600}
#toast{position:fixed;top:68px;left:50%;transform:translate(-50%,-8px);opacity:0;pointer-events:none;z-index:6;display:flex;gap:10px;align-items:center;padding:8px 14px;background:var(--strong);color:var(--strong-inv);border-radius:100px;font:500 13px Inter;transition:opacity .25s cubic-bezier(.2,0,0,1),transform .25s cubic-bezier(.2,0,0,1)}
#toast.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}#toast button{background:none;border:none;color:inherit;text-decoration:underline;padding:0;font:inherit}
#toast i{width:8px;height:8px;border-radius:100px;background:#22c55e;display:inline-block}
#library{transition:transform .25s cubic-bezier(.2,0,0,1),opacity .25s cubic-bezier(.2,0,0,1);position:fixed;left:12px;top:12px;bottom:12px;width:260px;display:flex;flex-direction:column;padding:16px 12px 10px;background:var(--surface);border:1px solid var(--line);border-radius:16px;z-index:3;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06)}
.libhead{display:flex;flex-direction:column;gap:2px;padding:2px 8px 14px}.libhead b{font:700 20px/1 Outfit,system-ui;letter-spacing:-.02em;color:var(--text)}.libhead span{font:400 12px Inter;color:var(--faint)}
#libsearch{width:100%;box-sizing:border-box;margin:0 0 12px;padding:8px 12px;border-radius:100px;border:1px solid var(--line);background:var(--chip);color:var(--text);font:400 13px Inter;outline:none}
#libtree{flex:1;overflow:auto;margin:0 -4px;padding:0 4px}
#libtree .sec{display:flex;align-items:center;gap:6px;margin:14px 0 4px;padding:2px 8px;font:600 11px Inter;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);cursor:pointer;user-select:none}
#libtree .sec:before{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translate(-1px,-1px);transition:transform .2s cubic-bezier(.2,0,0,1)}
#libtree .sec.closed:before{transform:rotate(-45deg)}#libtree .hidden{display:none}
#libtree a span{flex:1;min-width:0}#libtree a.on svg{color:var(--text)}
#libfoot{margin:8px -2px 0;padding:10px 8px 2px;border-top:1px solid var(--line);font:500 11px/1.5 Inter;color:var(--faint)}
#loading{position:fixed;top:50%;left:calc(var(--libw) + (100vw - var(--libw) - var(--panelw)) / 2);transform:translate(-50%,-50%);padding:8px 16px;border-radius:100px;background:var(--surface);border:1px solid var(--line);font:500 13px Inter;color:var(--muted);z-index:2;opacity:0;transition:opacity .2s cubic-bezier(.2,0,0,1);pointer-events:none}
#loading.on{opacity:1}
#libtree .sub{padding-left:14px}
#libtree a{display:flex;gap:9px;align-items:flex-start;padding:7px 10px;border-radius:8px;color:var(--text);text-decoration:none;font:400 13px/1.4 Inter;cursor:pointer}
#libtree a:hover{background:var(--hover)}#libtree a.on{background:var(--chip);font-weight:600}
.pop{display:none;position:absolute;top:calc(100% + 8px);right:0;min-width:240px;max-height:60vh;overflow:auto;padding:6px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:5}
.pop.open{display:block}.pop a{display:block;padding:8px 12px;border-radius:8px;color:var(--text);cursor:pointer;font:400 13px Inter;text-decoration:none}.pop a:hover,.pop a.on{background:var(--hover)}.pop a.on{font-weight:600}
#versionBanner{display:none;position:fixed;top:68px;left:50%;transform:translateX(-50%);z-index:4;gap:12px;align-items:center;padding:8px 16px;border-radius:100px;background:var(--surface);border:1px solid var(--line);font:500 13px Inter;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.1)}
#versionBanner.on{display:flex}#versionBanner button{background:var(--strong);color:var(--strong-inv);border:none;border-radius:100px;padding:5px 12px;font:600 12px Inter}#versionBanner button.ghost2{background:none;color:var(--text);border:1px solid var(--line)}
body.lib-closed{--libw:12px}body.steps-closed{--panelw:12px}body.steps-closed #steps{transform:translateX(110%);opacity:0;pointer-events:none}
#stepshide{position:absolute;top:18px;right:14px}#stepsshow{position:fixed;top:12px;right:12px;z-index:3;display:none;background:var(--surface);border:1px solid var(--line);border-radius:100px;padding:8px 14px;font:500 13px Inter;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.08);cursor:pointer}body.steps-closed #stepsshow{display:block}
#stepshide{background:none;border:none;color:var(--muted);border-radius:8px;padding:4px;cursor:pointer;display:flex}#stepshide:hover{background:var(--hover);color:var(--text)}body.lib-closed #library{transform:translateX(-110%);opacity:0;pointer-events:none}
.libhead{position:relative}#libhide,#libshow{background:none;border:none;color:var(--muted);border-radius:8px;padding:4px;cursor:pointer;display:flex}#libhide:hover,#libshow:hover{background:var(--hover);color:var(--text)}
#libhide{position:absolute;right:0;top:0}#libshow{display:none}body.lib-closed #libshow{display:flex}
@media (max-width:1440px){#toolbar{gap:2px;padding:5px}#toolbar button{padding:6px 9px;font-size:12.5px}}
#where{position:fixed;left:calc(var(--libw) + 30px);bottom:20px;z-index:2;font:500 12px ui-monospace,Menlo,monospace;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:100px;padding:5px 12px;pointer-events:none}
.brandlogo{display:block;margin-bottom:8px}
#viewport{position:absolute;inset:0;width:100%;height:100%;display:block}
</style></head><body>
<div id="stage"><svg id="viewport" xmlns="http://www.w3.org/2000/svg"><g id="world"></g></svg></div>
<header id="nav"><button id="libshow" title="Show maps"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg></button><button id="back" class="ghost" title="Back (Esc)">← Back</button><span id="trail"></span><button id="historyBtn" class="ghost">History</button><div id="historyList" class="pop"></div><button id="branch" class="chip" title="Show all paths"></button><button id="issues" class="chip"></button><div id="issueList"></div></header>
<div id="toolbar">
<button id="zoomOut" title="Zoom out">−</button><button id="fit" title="Fit all"><span id="zoom"></span></button><button id="zoomIn" title="Zoom in">+</button>
<span class="sep"></span>
<button id="copy4claude" class="primary">Copy for AI</button>
</div>
<div id="panel"></div>
<aside id="library"><div class="libhead"><svg class="brandlogo" width="22" height="22" viewBox="0 0 256 256" aria-label="Daguito"><circle cx="128" cy="128" r="120" fill="#0a0a0a" stroke="#ffffff" stroke-width="8"/><path d="M80 68 V188 H116 A60 60 0 0 0 116 68 Z" fill="#ffffff"/></svg><b>Mapi</b><span>Maps · by Daguito</span><button id="libhide" title="Hide maps"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg></button></div><input id="libsearch" placeholder="Search maps…" autocomplete="off"><nav id="libtree"></nav><div id="libfoot"></div></aside>
<div id="versionBanner"></div>
<aside id="steps"></aside><button id="stepsshow" title="Show steps">Steps</button>
<div id="toast" role="status"></div>
<div id="rulerX"></div><div id="rulerY"></div><div id="where"></div><div id="loading">Drawing…</div>
<script>
const q = new URLSearchParams(location.search)
if (!q.get('file')) q.set('file', ${JSON.stringify(file)})
const $ = (id) => document.getElementById(id)
const stage = $('stage'), world = $('world')
const view = { x: 0, y: 0, k: 1 }
let size = { w: 1, h: 1 }, grid = { color: '#262626', size: 40 }, fitted = false

function apply() {
  // Transform INSIDE the SVG so the browser re-rasterizes vectors at every zoom level
  // (a CSS scale on a composited layer would just stretch pixels and blur).
  world.setAttribute('transform', 'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')')
  const g = grid.size * view.k
  stage.style.backgroundSize = g + 'px ' + g + 'px'
  stage.style.backgroundPosition = view.x + 'px ' + view.y + 'px'
  $('zoom').textContent = Math.round(view.k * 100) + '%'
  drawRulers(); renderStatus(); showWhere()
}
// Camera fly-to: ease the view so the given diagram-space box sits centred in the
// free area (left of the steps panel, below the header).
const HEADER_H = 64, TOOLBAR_H = 64
const panelW = () => (document.body.classList.contains('steps-closed') ? 12 : 340)
const libW = () => (document.body.classList.contains('lib-closed') ? 12 : 300)
// "Viendo C3–H8": which ruler cells the visible canvas covers, so any screenshot says
// where on the map it is (same cells as the rulers and the AI's placement text).
function cellName(i) { return i < 26 ? String.fromCharCode(65 + i) : cellName(Math.floor(i / 26) - 1) + cellName(i % 26) }
function showWhere() {
  const f = freeArea()
  const wx = (sx) => (sx - view.x) / view.k, wy = (sy) => (sy - view.y) / view.k
  const c0 = Math.max(0, Math.floor(wx(f.x) / CELL)), c1 = Math.max(0, Math.floor(wx(f.x + f.w) / CELL))
  const r0 = Math.max(0, Math.floor(wy(f.y) / CELL)), r1 = Math.max(0, Math.floor(wy(f.y + f.h) / CELL))
  $('where').textContent = 'Viewing ' + cellName(c0) + (r0 + 1) + '–' + cellName(c1) + (r1 + 1)
}
/** The canvas area not covered by the nav, the steps panel or the toolbar. */
function freeArea() {
  return { x: libW() + 12, y: HEADER_H + 8, w: innerWidth - panelW() - libW() - 24, h: innerHeight - HEADER_H - TOOLBAR_H - 24 }
}
let flight = 0
function bezierEase(t) {
  // cubic-bezier(0.2, 0, 0, 1) — the standard easing; solve x(u)=t by bisection.
  const bx = (u) => 3 * (1 - u) * (1 - u) * u * 0.2 + u * u * u
  const by = (u) => 3 * (1 - u) * u * u + u * u * u
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (bx(mid) < t) lo = mid; else hi = mid }
  return by((lo + hi) / 2)
}
function flyTo(box, maxZoom = 1.6) {
  const a = freeArea()
  const k = Math.min(maxZoom, a.w / Math.max(box.w, 1), a.h / Math.max(box.h, 1))
  const target = {
    k,
    x: a.x + (a.w - box.w * k) / 2 - box.x * k,
    y: a.y + (a.h - box.h * k) / 2 - box.y * k,
  }
  const from = { ...view }, start = performance.now(), id = ++flight
  const tick = (now) => {
    if (id !== flight) return
    const t = Math.min(1, (now - start) / 550), e = bezierEase(t)
    view.x = from.x + (target.x - from.x) * e
    view.y = from.y + (target.y - from.y) * e
    view.k = from.k + (target.k - from.k) * e
    apply()
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
function boxOf(elements) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const el of elements) {
    const b = el.getBBox()
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height)
  }
  const pad = 40
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }
}
// Chess-style coordinates every CELL diagram units: columns A, B, C… and rows 1, 2, 3…
// so "look at D4" in a screenshot maps to one spot.
const CELL = 200
function colName(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
function cellOf(x, y) { return colName(Math.max(0, Math.floor(x / CELL))) + (Math.max(0, Math.floor(y / CELL)) + 1) }
function drawRulers() {
  const rx = $('rulerX'), ry = $('rulerY'); rx.textContent = ''; ry.textContent = ''
  const step = CELL * view.k
  if (step < 28) return
  const first = Math.max(0, Math.floor(-view.x / step)), lastX = Math.ceil((innerWidth - view.x) / step)
  for (let i = first; i < lastX; i++) {
    const el = document.createElement('span'); el.textContent = colName(i)
    el.style.left = (view.x + i * step + 4 - libW() - 8) + 'px'; rx.append(el)
  }
  const firstY = Math.max(0, Math.floor(-view.y / step)), lastY = Math.ceil((innerHeight - view.y) / step)
  for (let j = firstY; j < lastY; j++) {
    const el = document.createElement('span'); el.textContent = String(j + 1)
    el.style.top = (view.y + j * step + 4 - 64) + 'px'; ry.append(el)
  }
}
function nodeBox(id) {
  const g = world.querySelector('[data-id="' + CSS.escape(id) + '"]')
  return g ? g.getBBox() : null
}
function renderStatus() {
  const where = (q.get('file') || '') + (q.get('focus') ? ' › ' + q.get('focus') : '')
  let sel = ''
  if (selected) { const b = nodeBox(selected); sel = ' · selected: ' + selected + (b ? ' (' + cellOf(b.x + b.width / 2, b.y + b.height / 2) + ')' : '') }
  $('libfoot').textContent = 'Zoom ' + Math.round(view.k * 100) + '%' + sel
  $('libfoot').title = where
}
/** A short, exact text snapshot of what is on screen — better than a screenshot for Claude. */
function snapshotText() {
  const lines = ['Mapi · file: ' + q.get('file') + ' · level: ' + (q.get('focus') || 'root') +
    ' · zoom ' + Math.round(view.k * 100) + '%']
  if (selected) lines.push('selected: ' + selected + ' "' + labelOf(selected) + '"')
  const vis = []
  for (const it of items) {
    const b = nodeBox(it.id); if (!b) continue
    const sx = view.x + b.x * view.k, sy = view.y + b.y * view.k
    if (sx + b.width * view.k < 0 || sx > innerWidth || sy + b.height * view.k < 0 || sy > innerHeight) continue
    vis.push(it.id + ' "' + short(it.label) + '" @' + cellOf(b.x + b.width / 2, b.y + b.height / 2))
  }
  lines.push('visibles: ' + vis.join(' · '))
  return lines.join('\\n')
}
// Frame the whole level in the free area. A tall story that would shrink below a
// readable size is shown from its START (top) instead — the reader begins at step 1.
// The "fit" button always frames everything (animated); only an automatic entry
// into a level applies the start-at-the-top rule.
const READABLE_ZOOM = 0.75
function fit(mode) {
  flight++
  const a = freeArea()
  const whole = Math.min(a.w / size.w, a.h / size.h, 1.3) * 0.94
  if (mode !== 'enter') { flyTo({ x: 0, y: 0, w: size.w, h: size.h }, 1.3); return }
  const k = whole >= READABLE_ZOOM ? whole : Math.min(READABLE_ZOOM, (a.w / size.w) * 0.94)
  view.k = k
  view.x = a.x + (a.w - size.w * k) / 2
  view.y = whole >= READABLE_ZOOM ? a.y + (a.h - size.h * k) / 2 : a.y
  apply()
}
function renderTrail(trail) {
  const el = $('trail'); el.textContent = ''
  trail.forEach((crumb, i) => {
    if (i > 0) el.append(' › ')
    const b = document.createElement('button')
    b.textContent = crumb.label
    b.onclick = () => go(crumb.id)
    el.append(b)
  })
  trailIds = trail.map((c) => c.id)
}
let trailIds = [null]
let items = [], links = [], selected = null, repoRoot = ''
// Full name on one line (multi-line box labels joined) — never cut mid-phrase.
const short = (label) => label.split('\\n').join(' ')
function labelOf(id) { const it = items.find((i) => i.id === id) || items.find((i) => baseId(i.id) === baseId(id)); return it ? short(it.label) : id }
// Children carry a qualified id ("data.vk") while lines may name them either way.
// Copies of a [clone] box are "<id>~<n>": every copy counts as the same box.
const baseId = (id) => id.split('~')[0].split('.').pop()
const sameId = (a, b) => baseId(a) === baseId(b)
// Selecting a box answers "who talks to this?": only its lines and their other ends stay lit.
function focusConnections(id) {
  world.querySelectorAll('.hl').forEach((g) => g.classList.remove('hl'))
  world.classList.toggle('focusing', !!id)
  if (!id) return
  const lit = new Set([id])
  world.querySelectorAll('g[data-from]').forEach((g) => {
    const from = g.getAttribute('data-from'), to = g.getAttribute('data-to')
    if (!sameId(from, id) && !sameId(to, id)) return
    g.classList.add('hl'); lit.add(from); lit.add(to)
  })
  // The same real resource drawn twice ([same=…] or a [clone] copy): light every drawing.
  const sel = world.querySelector('[data-id="' + CSS.escape(id) + '"]')
  const ref = sel ? sel.getAttribute('data-ref') : null
  if (ref) world.querySelectorAll('g[data-ref="' + CSS.escape(ref) + '"]').forEach((g) => lit.add(g.getAttribute('data-id')))
  world.querySelectorAll('g[data-id]').forEach((g) => {
    const gid = g.getAttribute('data-id')
    const ancestor = [...lit].some((l) => l.startsWith(gid + '.') || id.startsWith(gid + '.'))
    if ([...lit].some((l) => sameId(l, gid)) || ancestor) g.classList.add('hl')
  })
}
function connectionList(title, list) {
  if (list.length === 0) return ''
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  return '<p class="conn">' + title + '</p><ul>' + list.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>'
}
function showSelection() {
  world.querySelectorAll('g.sel').forEach((g) => g.classList.remove('sel'))
  focusConnections(selected)
  const panel = $('panel')
  renderStatus()
  if (!selected) { panel.classList.remove('open'); return }
  const g = world.querySelector('[data-id="' + CSS.escape(selected) + '"]')
  if (g) g.classList.add('sel')
  const it = items.find((i) => i.id === selected) || items.find((i) => baseId(i.id) === baseId(selected)) || { id: selected, label: selected, layer: null }
  const withWhy = (other, l) => labelOf(other) + (l.label ? ' — ' + l.label : '')
  const incoming = links.filter((l) => sameId(l.to, selected)).map((l) => withWhy(l.from, l))
  const outgoing = links.filter((l) => sameId(l.from, selected)).map((l) => withWhy(l.to, l))
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  panel.innerHTML = '<h3>' + esc(it.label).replace(/\\n/g, '<br>') + '</h3>' +
    '<div><span class="muted">id</span> <code>' + esc(it.id) + '</code> <button id="copy">Copy</button></div>' +
    (it.layer ? '<div><span class="muted">capa</span> ' + esc(it.layer) + '</div>' : '') +
    connectionList(selected.includes('~') ? 'Used by' : 'Receives from', incoming) +
    connectionList('Sends to', outgoing) +
    (it.code ? '<div><span class="muted">code</span> <code>' + esc(it.code) + '</code></div><button id="opencode">Open in code ›</button> ' : '') +
    (g && g.hasAttribute('data-link') ? '<button id="openmap">Open map: ' + esc(g.getAttribute('data-link')) + ' ›</button>' : '') +
    (g && g.hasAttribute('data-drill') ? '<button id="enter">Open detail ›</button>' : '')
  panel.classList.add('open')
  $('copy').onclick = () => navigator.clipboard.writeText(it.id)
  if ($('enter')) $('enter').onclick = () => go(g.getAttribute('data-ref') || it.id)
  if ($('opencode')) $('opencode').onclick = () => {
    const [path, line] = it.code.split(':')
    location.href = 'vscode://file/' + repoRoot + '/' + path + ':' + line
  }
  if ($('openmap')) $('openmap').onclick = () => openMap(g.getAttribute('data-link'))
}
// Click a line of an alternative path (2a, 2b…) → show only that path plus the shared
// story; everything that belongs to another path fades.
let branchFilter = null
const letterOf = (step) => { const m = /^\d+([a-z])$/.exec(step || ''); return m ? m[1] : null }
/**
 * Show one path end to end: from the clicked line, walk the story edges backwards
 * from its start and forwards from its end, never crossing a line of another path.
 * Only that route stays visible (and listed in the steps panel).
 */
function applyBranch() {
  const chip = $('branch')
  world.querySelectorAll('g.dim,g.gone').forEach((g) => g.classList.remove('dim', 'gone'))
  document.querySelectorAll('#steps li').forEach((li) => li.classList.remove('gone'))
  if (!branchFilter) { chip.classList.remove('on'); chip.textContent = ''; return }
  chip.classList.add('on'); chip.textContent = 'Path ' + branchFilter.letter + '  ×'
  const story = [...world.querySelectorAll('[data-from][data-step]')]
    .map((g) => ({ g, from: g.getAttribute('data-from'), to: g.getAttribute('data-to'), step: g.getAttribute('data-step') }))
    .filter((e) => { const l = letterOf(e.step); return !l || l === branchFilter.letter })
  const keepEdges = new Set([branchFilter.key]), keepNodes = new Set([branchFilter.from, branchFilter.to])
  const walk = (start, forward) => {
    const queue = [start]
    while (queue.length) {
      const at = queue.shift()
      for (const e of story) {
        const [here, next] = forward ? [e.from, e.to] : [e.to, e.from]
        const key = e.from + '>' + e.to
        if (here !== at || keepEdges.has(key)) continue
        keepEdges.add(key); keepNodes.add(next); queue.push(next)
      }
    }
  }
  walk(branchFilter.to, true); walk(branchFilter.from, false)
  world.querySelectorAll('[data-from]').forEach((g) => {
    if (!keepEdges.has(g.getAttribute('data-from') + '>' + g.getAttribute('data-to'))) g.classList.add('gone')
  })
  world.querySelectorAll('[data-id]').forEach((g) => {
    const id = g.getAttribute('data-id')
    // Notes stay readable; everything off the route nearly disappears.
    if (!keepNodes.has(id)) g.classList.add('gone')
  })
  document.querySelectorAll('#steps li').forEach((li) => {
    if (!keepEdges.has(li.dataset.key)) li.classList.add('gone')
  })
}
function edgeAt(e) {
  const hit = document.elementFromPoint(e.clientX, e.clientY)
  return hit && hit.closest('[data-from]')
}
function nodeAt(e) {
  // Pointer capture retargets events to the stage — hit-test what is under the cursor.
  const hit = document.elementFromPoint(e.clientX, e.clientY)
  return hit && hit.closest('[data-id]')
}
// Navigation is real history: each drill-in / map jump is a pushState, so "← Back",
// the browser back button and the trackpad swipe all return one level — and the
// camera comes back to exactly where it was on that level.
const cameras = new Map()
const levelKey = () => (q.get('file') || '') + '|' + (q.get('focus') || '')
const navStack = []
function navigate(file, focus) {
  flight++
  navStack.push({ file: q.get('file'), focus: q.get('focus'), view: { ...view } })
  cameras.set(levelKey(), { ...view })
  q.set('file', file)
  if (focus) q.set('focus', focus); else q.delete('focus')
  selected = null; branchFilter = null; q.delete('version'); $('versionBanner').classList.remove('on')
  history.pushState(null, '', '/view?' + q)
  fitted = false; refresh()
}
function go(id) { navigate(q.get('file'), id) }
function openMap(name) {
  const hit = library.find((e) => e.name === name)
  navigate(hit ? hit.path : name, null)
}
addEventListener('popstate', () => {
  navStack.pop()
  cameras.set(levelKey(), { ...view })
  const next = new URLSearchParams(location.search)
  for (const k of ['file', 'focus']) { if (next.get(k)) q.set(k, next.get(k)); else q.delete(k) }
  selected = null; fileSelect.set(q.get('file'))
  const saved = cameras.get(levelKey())
  if (saved) { Object.assign(view, saved); fitted = true } else fitted = false
  refresh()
})
/** "← Back": back to where you came from in this viewer; with no trail, up one level. */
function back() {
  flight++
  const prev = navStack.pop()
  const target = prev ?? (trailIds.length > 1 ? { file: q.get('file'), focus: trailIds[trailIds.length - 2], view: null } : null)
  if (!target) return
  q.set('file', target.file)
  if (target.focus) q.set('focus', target.focus); else q.delete('focus')
  selected = null; fileSelect.set(q.get('file'))
  history.replaceState(null, '', '/view?' + q)
  const saved = target.view ?? cameras.get(levelKey())
  if (saved) { Object.assign(view, saved); fitted = true } else fitted = false
  refresh()
}
async function refresh() {
  const loadingTimer = setTimeout(() => $('loading').classList.add('on'), 150)
  try { await draw() } finally { clearTimeout(loadingTimer); $('loading').classList.remove('on') }
}
async function draw() {
  renderLibrary()
  const focus = (q.get('focus') ? '&focus=' + encodeURIComponent(q.get('focus')) : '') + '&context=1' + (q.get('version') ? '&version=' + q.get('version') : '')
  const res = await fetch('/svg?file=' + encodeURIComponent(q.get('file')) + '&theme=light' + focus)
  const body = await res.json()
  world.innerHTML = body.svg
  size = { w: body.width || 1, h: body.height || 1 }
  grid = { color: body.grid, size: body.gridSize }
  stage.style.background = body.background
  stage.style.backgroundImage = body.gridKind === 'dots'
    ? 'radial-gradient(circle,' + grid.color + ' 1.1px,transparent 1.4px)'
    : 'linear-gradient(to right,' + grid.color + ' 1px,transparent 1px),linear-gradient(to bottom,' + grid.color + ' 1px,transparent 1px)'
  renderTrail(body.trail || [])
  items = body.items || []; links = body.links || []; repoRoot = body.repoRoot || ''
  renderSteps(body)
  applyBranch()
  if (selected && !items.some((i) => i.id === selected)) selected = null
  showSelection()
  renderIssues(body.errors || [])
  if (!fitted) { fitted = true; fit('enter') } else apply()
}

let drag = null
let moved = 0
// Dragging a top-level box moves it to another column: on drop the server writes the new
// col= into the .mapi and the live reload redraws. Dragging empty canvas still pans.
let boxDrag = null
const movable = (g) => g && !g.getAttribute('data-id').includes('.') && !g.getAttribute('data-id').includes('~')
stage.addEventListener('pointerdown', (e) => {
  moved = 0
  flight++
  const node = nodeAt(e)
  boxDrag = movable(node) && !q.get('version') ? { g: node, dx: 0, dy: 0 } : null
  drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging')
})
stage.addEventListener('pointermove', (e) => {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  moved += Math.abs(dx) + Math.abs(dy)
  drag = { x: e.clientX, y: e.clientY }
  if (boxDrag && moved > 4) {
    boxDrag.dx += dx / view.k; boxDrag.dy += dy / view.k
    boxDrag.g.setAttribute('transform', 'translate(' + boxDrag.dx + ',' + boxDrag.dy + ')')
    boxDrag.g.classList.add('moving')
    return
  }
  view.x += dx; view.y += dy; apply()
})
stage.addEventListener('pointerup', async (e) => {
  drag = null; stage.classList.remove('dragging')
  if (boxDrag && moved > 4) {
    const { g, dx } = boxDrag
    boxDrag = null
    const bb = g.getBBox()
    const id = g.getAttribute('data-id')
    const res = await fetch('/move?file=' + encodeURIComponent(q.get('file') || '') + '&id=' + encodeURIComponent(id) + '&x=' + Math.round(bb.x + bb.width / 2 + dx), { method: 'POST' })
    const body = await res.json().catch(() => ({ ok: false }))
    if (!body.ok) { g.removeAttribute('transform'); g.classList.remove('moving'); toast('Could not move ' + labelOf(id)); return }
    toast(labelOf(id) + ' → column ' + body.col)
    return
  }
  boxDrag = null
  if (moved > 4) return
  const edge = edgeAt(e)
  if (edge) {
    const l = letterOf(edge.getAttribute('data-step'))
    const from = edge.getAttribute('data-from'), to = edge.getAttribute('data-to')
    const key = from + '>' + to
    branchFilter = l && (!branchFilter || branchFilter.key !== key) ? { letter: l, from, to, key } : null
    applyBranch()
    return
  }
  if (branchFilter) { branchFilter = null; applyBranch() }
  const node = nodeAt(e)
  selected = node ? node.getAttribute('data-id') : null
  showSelection()
  if (node) flyTo(boxOf([node]), 1.4)
})
stage.addEventListener('dblclick', (e) => {
  const node = nodeAt(e)
  if (!node) return
  if (node.hasAttribute('data-link')) openMap(node.getAttribute('data-link'))
  else if (node.hasAttribute('data-drill')) go(node.getAttribute('data-ref') || node.getAttribute('data-id'))
})
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (selected) { selected = null; showSelection(); return }
  back()
})
stage.addEventListener('wheel', (e) => {
  e.preventDefault()
  flight++
  if (e.ctrlKey || e.metaKey) {
    const k = Math.min(12, Math.max(0.1, view.k * Math.exp(-e.deltaY * 0.01)))
    view.x = e.clientX - ((e.clientX - view.x) * k) / view.k
    view.y = e.clientY - ((e.clientY - view.y) * k) / view.k
    view.k = k
  } else { view.x -= e.deltaX; view.y -= e.deltaY }
  apply()
}, { passive: false })

$('fit').onclick = () => fit('whole')
$('copy4claude').onclick = async () => {
  const btn = $('copy4claude')
  try { await navigator.clipboard.writeText(snapshotText()); btn.textContent = 'Copied' }
  catch (err) { console.warn('[mapi] clipboard', err); btn.textContent = 'Could not copy' }
  setTimeout(() => { btn.textContent = 'Copy for AI' }, 1500)
}
$('back').onclick = back
// Overlaps / parse errors are real problems (red chip); standard warnings are a quiet
// reminder (neutral chip). Both open a list on click instead of filling the bar.
function renderIssues(issues) {
  const errs = issues.filter((e) => e.level !== 'warning'), warns = issues.filter((e) => e.level === 'warning')
  const chip = $('issues'), list = $('issueList')
  chip.className = 'chip' + (errs.length ? ' err' : '')
  chip.textContent = errs.length ? errs.length + (errs.length === 1 ? ' problem' : ' problems')
    : warns.length ? warns.length + (warns.length === 1 ? ' warning' : ' warnings') : ''
  list.textContent = ''
  for (const e of [...errs, ...warns]) { const d = document.createElement('div'); d.textContent = (e.line ? 'L' + e.line + ' ' : '') + e.message; list.append(d) }
  if (!chip.textContent) list.classList.remove('open')
}
function renderSteps(body) {
  const el = $('steps'); el.textContent = ''
  const isArch = body.kind === 'architecture'
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = isArch ? 'How it works' : 'Step by step'
  const hide = document.createElement('button'); hide.id = 'stepshide'; hide.title = 'Hide steps'
  hide.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/></svg>'
  hide.onclick = () => setSteps(false)
  el.append(eyebrow, hide)
  const h = document.createElement('h2'); h.textContent = (body.trail || []).slice(-1)[0]?.label || ''
  el.append(h)
  if (body.summary && (body.trail || []).length <= 1) {
    const p = document.createElement('p'); p.className = 'idea'; p.textContent = body.summary; el.append(p)
  }
  if (isArch) { renderComponents(el, body.components || []); appendLegend(el); return }
  if (!body.steps || body.steps.length === 0) {
    const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No numbered steps at this level.'; el.append(p)
    return
  }
  const ol = document.createElement('ol')
  for (const st of body.steps) {
    const li = document.createElement('li')
    li.dataset.key = st.from + '>' + st.to
    if (String(st.step).includes('.')) li.classList.add('sub')
    const n = document.createElement('span'); n.className = 'n'; n.textContent = st.step
    const letter = /^\d+([a-z])$/.exec(st.step)
    if (letter && body.branches) n.style.background = body.branches[(letter[1].charCodeAt(0) - 97) % body.branches.length]
    const t = document.createElement('div')
    const who = document.createElement('div'); who.className = 'who'
    const arrow = document.createElement('span'); arrow.textContent = '→'
    who.append(labelOf(st.from), arrow, labelOf(st.to))
    t.append(who)
    if (st.label) { const what = document.createElement('div'); what.className = 'what'; what.textContent = st.label; t.append(what) }
    if ((body.drillable || []).includes(st.to)) {
      const more = document.createElement('button'); more.className = 'more'
      more.textContent = 'Open detail of ' + labelOf(st.to) + ' ›'
      more.onclick = (ev) => { ev.stopPropagation(); go(st.to) }
      t.append(more)
    }
    li.append(n, t)
    li.onclick = () => focusStep(st, li)
    ol.append(li)
  }
  el.append(ol)
  appendLegend(el)
}
function appendLegend(el) {
  const legend = document.createElement('div'); legend.className = 'legend'
  legend.innerHTML = LEGEND
  el.append(legend)
}
// Architecture panel: every piece with what it is, grouped by its section; click flies to it.
function renderComponents(el, components) {
  let group
  for (const c of components) {
    if (c.group !== group) {
      group = c.group
      if (group) { const g = document.createElement('div'); g.className = 'cgroup'; g.textContent = group; el.append(g) }
    }
    const row = document.createElement('div'); row.className = 'comp'
    const name = document.createElement('div'); name.className = 'cname'; name.textContent = c.label
    row.append(name)
    if (c.about) { const a = document.createElement('div'); a.className = 'cabout'; a.textContent = c.about; row.append(a) }
    row.onclick = () => {
      selected = c.id; showSelection()
      const g = world.querySelector('[data-id="' + CSS.escape(c.id) + '"]')
      if (g) flyTo(boxOf([g]), 1.4)
    }
    el.append(row)
  }
}
const LEGEND = ${JSON.stringify(LEGEND_HTML)}
function focusStep(st, li) {
  const already = li.classList.contains('on')
  document.querySelectorAll('#steps li').forEach((x) => x.classList.remove('on'))
  world.querySelectorAll('g.dim').forEach((g) => g.classList.remove('dim'))
  if (already) return
  li.classList.add('on')
  const sel = '[data-from="' + CSS.escape(st.from) + '"][data-to="' + CSS.escape(st.to) + '"]'
  const litEls = []
  world.querySelectorAll('[data-id],[data-from]').forEach((g) => {
    const lit = g.matches(sel) || g.getAttribute('data-id') === st.from || g.getAttribute('data-id') === st.to
    if (lit) litEls.push(g); else g.classList.add('dim')
  })
  if (litEls.length) flyTo(boxOf(litEls))
}
/** Mapi select: replaces the native <select> with a styled, keyboard-navigable list. */
function createSelect(root, { options, value, onChange, label }) {
  root.textContent = ''
  const btn = document.createElement('button'), list = document.createElement('ul')
  btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); list.setAttribute('role', 'listbox')
  root.append(btn, list)
  let current = value, active = -1
  const render = () => {
    btn.textContent = label ? label(current) : current
    list.textContent = ''
    options.forEach((o, i) => {
      const li = document.createElement('li'); li.textContent = label ? label(o) : o; li.setAttribute('role', 'option')
      if (o === current) li.classList.add('on')
      if (i === active) li.classList.add('active')
      li.onclick = () => choose(o)
      list.append(li)
    })
  }
  const close = () => { root.classList.remove('open'); active = -1 }
  const choose = (o) => { close(); if (o !== current) { current = o; render(); onChange(o) } else render() }
  btn.onclick = () => { root.classList.toggle('open'); active = options.indexOf(current); render() }
  root.addEventListener('keydown', (e) => {
    if (!root.classList.contains('open')) return
    if (e.key === 'ArrowDown') { active = Math.min(options.length - 1, active + 1); render(); e.preventDefault() }
    if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault() }
    if (e.key === 'Enter' && active >= 0) { choose(options[active]); e.preventDefault() }
    if (e.key === 'Escape') { close(); e.stopPropagation() }
  })
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) close() })
  render()
  return { set(v) { current = v; render() } }
}
// Documentation tree: sections are folders, maps show their title.
let library = []
const fileSelect = { set() { renderLibrary() } }
const closedSections = new Set()
function renderLibrary() {
  const tree = $('libtree'); tree.textContent = ''
  const term = ($('libsearch').value || '').toLowerCase()
  const shown = new Set()
  for (const e of library) {
    if (term && !(e.title + ' ' + e.section.join(' ')).toLowerCase().includes(term)) continue
    // section headers (each level once), collapsible
    e.section.forEach((part, depth) => {
      const key = e.section.slice(0, depth + 1).join(' › ')
      if (shown.has(key)) return
      shown.add(key)
      const parentClosed = e.section.slice(0, depth).some((_, i) => closedSections.has(e.section.slice(0, i + 1).join(' › ')))
      const h = document.createElement('div')
      h.className = 'sec' + (depth ? ' sub' : '') + (closedSections.has(key) ? ' closed' : '') + (parentClosed && !term ? ' hidden' : '')
      h.textContent = part
      h.onclick = () => { if (closedSections.has(key)) closedSections.delete(key); else closedSections.add(key); renderLibrary() }
      tree.append(h)
    })
    const hidden = !term && e.section.some((_, i) => closedSections.has(e.section.slice(0, i + 1).join(' › ')))
    const a = document.createElement('a')
    const label = document.createElement('span'); label.textContent = e.title; a.append(label)
    a.title = e.path
    if (e.section.length > 1) a.classList.add('sub')
    if (hidden) a.classList.add('hidden')
    if (e.path === q.get('file') || e.name === q.get('file')) a.classList.add('on')
    a.onclick = () => navigate(e.path, null)
    tree.append(a)
  }
}
$('libsearch').oninput = renderLibrary
const LIB_KEY = 'mapi:lib-closed'
function setLibrary(open) {
  document.body.classList.toggle('lib-closed', !open)
  try { localStorage.setItem(LIB_KEY, open ? '0' : '1') } catch (err) { console.warn('[mapi] sidebar pref not saved', err) }
  apply()
}
try { if (localStorage.getItem(LIB_KEY) === '1') document.body.classList.add('lib-closed') } catch (err) { console.warn('[mapi] sidebar pref not read', err) }
$('libhide').onclick = () => setLibrary(false)
const STEPS_KEY = 'mapi:steps-closed'
function setSteps(open) {
  document.body.classList.toggle('steps-closed', !open)
  try { localStorage.setItem(STEPS_KEY, open ? '0' : '1') } catch (err) { console.warn('[mapi] panel pref not saved', err) }
  apply()
}
try { if (localStorage.getItem(STEPS_KEY) === '1') document.body.classList.add('steps-closed') } catch (err) { console.warn('[mapi] panel pref not read', err) }
$('stepsshow').onclick = () => setSteps(true)
$('libshow').onclick = () => setLibrary(true)
// The sidebar re-reads the folder on every change, so a new, renamed or deleted map shows up live.
const loadLibrary = () =>
  fetch('/files').then((r) => r.json()).then((entries) => { library = entries; renderLibrary() })
    .catch((err) => console.warn('[mapi] library not loaded', err))
loadLibrary()

// History: every save is a version; view one read-only and restore it if needed.
async function openHistory() {
  const list = $('historyList')
  if (list.classList.contains('open')) { list.classList.remove('open'); return }
  const versions = await (await fetch('/history?file=' + encodeURIComponent(q.get('file')))).json()
  list.textContent = ''
  const current = document.createElement('a'); current.textContent = 'Current version'
  if (!q.get('version')) current.classList.add('on')
  current.onclick = () => showVersion(null)
  list.append(current)
  for (const v of versions) {
    const a = document.createElement('a')
    a.textContent = new Date(v.at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    if (q.get('version') === v.id) a.classList.add('on')
    a.onclick = () => showVersion(v)
    list.append(a)
  }
  list.classList.add('open')
}
function showVersion(v) {
  $('historyList').classList.remove('open')
  if (v) q.set('version', v.id); else q.delete('version')
  history.replaceState(null, '', '/view?' + q)
  const banner = $('versionBanner'); banner.textContent = ''
  if (v) {
    banner.append('Viewing the version from ' + new Date(v.at).toLocaleString('en-US', { hour12: false }))
    const restore = document.createElement('button'); restore.textContent = 'Restore this version'
    restore.onclick = async () => {
      await fetch('/restore?file=' + encodeURIComponent(q.get('file')) + '&version=' + v.id, { method: 'POST' })
      showVersion(null); toast('Version restored · ' + clock())
    }
    const back = document.createElement('button'); back.className = 'ghost2'; back.textContent = 'Back to current'
    back.onclick = () => showVersion(null)
    banner.append(restore, back); banner.classList.add('on')
  } else banner.classList.remove('on')
  refresh()
}
$('historyBtn').onclick = openHistory
function zoomBy(f) {
  const cx = libW() + (innerWidth - libW() - panelW()) / 2, cy = innerHeight / 2
  const k = Math.min(12, Math.max(0.1, view.k * f))
  view.x = cx - ((cx - view.x) * k) / view.k; view.y = cy - ((cy - view.y) * k) / view.k; view.k = k; apply()
}
$('zoomIn').onclick = () => zoomBy(1.25)
$('zoomOut').onclick = () => zoomBy(0.8)
$('issues').onclick = () => $('issueList').classList.toggle('open')
$('branch').onclick = () => { branchFilter = null; applyBranch() }
// Hot reload: .mapi edits re-render in place; a new server boot id means the code
// changed, so reload the page — keeping camera + level via sessionStorage.
const CAMERA_KEY = 'mapi:camera'
// Visible confirmation for every live change (the green dot = "live/ok", the one allowed colour).
let toastTimer = 0
function toast(text, action) {
  const t = $('toast'); t.textContent = ''
  const dot = document.createElement('i'); t.append(dot, document.createTextNode(text))
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.run; t.append(b) }
  t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600)
}
const clock = () => new Date().toLocaleTimeString('en-US', { hour12: false })
// ?nolive=1 skips the live channel (headless screenshots never go idle with it open).
const events = q.get('nolive') ? { addEventListener() {} } : new EventSource('/events')
events.onmessage = async (e) => {
  const known = library.some((x) => x.path === e.data)
  await loadLibrary()
  const changed = e.data, entry = library.find((x) => x.path === changed), name = entry ? entry.title : changed
  if (!known && entry) { toast('New map: ' + name, { label: 'Open', run: () => navigate(changed, null) }); return }
  if (!entry) return
  if (changed === q.get('file')) { await refresh(); toast('Updated · ' + name + ' · ' + clock()) }
  else toast('Another map changed: ' + name, { label: 'Open', run: () => navigate(changed, null) })
}
let bootId = null
events.addEventListener('boot', (e) => {
  if (bootId && bootId !== e.data) {
    try { sessionStorage.setItem(CAMERA_KEY, JSON.stringify({ url: location.href, view, reloaded: true })) } catch (err) { console.warn('[mapi] camera not saved', err) }
    location.reload()
  }
  bootId = e.data
})
try {
  const saved = JSON.parse(sessionStorage.getItem(CAMERA_KEY) || 'null')
  sessionStorage.removeItem(CAMERA_KEY)
  if (saved && saved.url === location.href) { Object.assign(view, saved.view); fitted = true }
  if (saved && saved.reloaded) setTimeout(() => toast('Viewer updated · ' + clock()), 300)
} catch (err) { console.warn('[mapi] camera not restored', err) }
refresh()
</script></body></html>`
}
