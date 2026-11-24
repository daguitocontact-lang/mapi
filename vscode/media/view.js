'use strict'

// A Mapi map in a Kiro / VS Code tab — the same view as the Daguito IDE's Visual panel:
// title + one-line summary, the drawing with pan/zoom, and only + − ⊡. The extension
// host draws the SVG with the Mapi engine; this page only shows it and wires the clicks
// Mapi defines (a map link opens that map, double-clicking a group drills into it).
;(() => {
  const vscode = acquireVsCodeApi()
  const MIN_SCALE = 0.1
  const MAX_SCALE = 4
  const PAD = 24
  const host = document.getElementById('app')
  const clamp = (v) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v))

  // Drill-down path, pan/zoom per level and whether the summary is unfolded survive
  // re-renders and reopening the tab (webview state is kept by the editor).
  const saved = vscode.getState() || {}
  const state = {
    focus: Array.isArray(saved.focus) ? saved.focus : [],
    views: new Map(Object.entries(saved.views || {})),
    summaryOpen: saved.summaryOpen === true,
  }
  const save = () =>
    vscode.setState({ focus: state.focus, views: Object.fromEntries(state.views), summaryOpen: state.summaryOpen })

  function node(tag, cls, text) {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  function issuesBox(errors, warnings) {
    const all = [...errors.map((e) => ({ ...e, level: 'error' })), ...warnings]
    if (!all.length) return null
    const box = node('div', 'mapi-issues')
    for (const issue of all.slice(0, 6)) {
      const row = node('div', 'mapi-issue mapi-issue-' + (issue.level || 'warning'))
      row.textContent = (issue.line ? `L${issue.line} · ` : '') + issue.message
      box.append(row)
    }
    if (all.length > 6) box.append(node('div', 'mapi-issue', `+${all.length - 6} more`))
    return box
  }

  function attachPanZoom(stage, canvas, svgSize, view) {
    // will-change keeps panning smooth but freezes the SVG as a bitmap at its old
    // scale, so zooming in blurs it. Hold it only while moving.
    let settleTimer = null
    const apply = () => {
      canvas.classList.add('moving')
      canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => canvas.classList.remove('moving'), 150)
      save()
    }
    const fit = () => {
      const w = stage.clientWidth
      const h = stage.clientHeight
      if (!w || !h) return
      view.s = clamp(Math.min(1, (w - PAD * 2) / svgSize.w, (h - PAD * 2) / svgSize.h))
      view.x = (w - svgSize.w * view.s) / 2
      view.y = Math.max(PAD, (h - svgSize.h * view.s) / 2)
      apply()
    }
    const zoomAt = (factor, mx, my) => {
      const ns = clamp(view.s * factor)
      view.x = mx - (mx - view.x) * (ns / view.s)
      view.y = my - (my - view.y) * (ns / view.s)
      view.s = ns
      apply()
    }
    // Until the user pans or zooms, keep the map fitted as the tab resizes.
    const ro = new ResizeObserver(() => !view.touched && fit())
    ro.observe(stage)
    apply()
    // Pinch (ctrlKey) or Cmd+wheel zooms around the cursor; plain wheel/trackpad pans.
    stage.onwheel = (e) => {
      e.preventDefault()
      view.touched = true
      const r = stage.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
        return
      }
      view.x -= e.deltaX
      view.y -= e.deltaY
      apply()
    }
    let drag = null
    stage.onmousedown = (e) => {
      if (e.button !== 0) return
      drag = { x: e.clientX - view.x, y: e.clientY - view.y, moved: 0 }
      stage.classList.add('dragging')
    }
    stage.onmousemove = (e) => {
      if (!drag) return
      const nx = e.clientX - drag.x
      const ny = e.clientY - drag.y
      drag.moved += Math.abs(nx - view.x) + Math.abs(ny - view.y)
      if (drag.moved > 4) view.touched = true
      view.x = nx
      view.y = ny
      apply()
    }
    stage.onmouseup = stage.onmouseleave = () => {
      if (drag) stage.dataset.dragged = drag.moved > 4 ? '1' : ''
      drag = null
      stage.classList.remove('dragging')
    }
    const centre = (factor) => {
      view.touched = true
      zoomAt(factor, stage.clientWidth / 2, stage.clientHeight / 2)
    }
    const refit = () => {
      view.touched = false
      fit()
    }
    return { in: () => centre(1.2), out: () => centre(1 / 1.2), fit: refit, stop: () => ro.disconnect() }
  }

  let zoom = null
  function paint(res, fileName) {
    const focusId = state.focus[state.focus.length - 1] || ''
    if (!state.views.has(focusId)) state.views.set(focusId, { s: 1, x: 0, y: 0, touched: false })
    const view = state.views.get(focusId)

    const root = node('div', 'mapi-view')
    const head = node('div', 'mapi-head')
    if (state.focus.length) {
      const back = node('button', 'mapi-back', '← Back')
      back.onclick = () => {
        state.focus.pop()
        save()
        draw()
      }
      head.append(back)
    }
    // One line by default (title + clipped summary) so the map keeps the room;
    // clicking it unfolds the whole summary.
    const line = node('div', 'mapi-head-line')
    line.append(node('span', 'mapi-title', res.title || fileName))
    if (res.summary) {
      line.append(node('span', 'mapi-summary', res.summary))
      line.append(node('span', 'mapi-summary-toggle', '▾'))
      head.classList.toggle('expanded', state.summaryOpen)
      line.onclick = () => {
        state.summaryOpen = !state.summaryOpen
        head.classList.toggle('expanded', state.summaryOpen)
        save()
      }
    }
    const text = node('div', 'mapi-head-text')
    text.append(line)
    head.append(text)
    root.append(head)

    const issues = issuesBox(res.errors || [], res.warnings || [])
    if (issues) root.append(issues)

    const stage = node('div', 'mapi-stage')
    const canvas = node('div', 'mapi-canvas')
    canvas.innerHTML = res.svg
    stage.append(canvas)
    root.append(stage)

    const svg = canvas.querySelector('svg')
    const size = {
      w: Number(svg && svg.getAttribute('width')) || 800,
      h: Number(svg && svg.getAttribute('height')) || 600,
    }
    if (zoom) zoom.stop()
    zoom = attachPanZoom(stage, canvas, size, view)

    stage.onclick = (e) => {
      if (stage.dataset.dragged) return
      const link = e.target.closest('g[data-link]')
      if (link) return vscode.postMessage({ type: 'openMap', name: link.getAttribute('data-link') })
      const doc = e.target.closest('g[data-doc]')
      if (doc) vscode.postMessage({ type: 'openDoc', id: doc.getAttribute('data-doc') })
    }
    stage.ondblclick = (e) => {
      const group = e.target.closest('g[data-drill]')
      if (!group) return
      state.focus.push(group.getAttribute('data-id'))
      save()
      draw()
    }

    const controls = node('div', 'mapi-zoom')
    for (const [label, fn] of [
      ['+', zoom.in],
      ['−', zoom.out],
      ['⊡', zoom.fit],
    ]) {
      const b = node('button', 'mapi-zoom-btn', label)
      b.onclick = fn
      controls.append(b)
    }
    root.append(controls)
    host.replaceChildren(root)
  }

  function showError(message) {
    // Keep the last good drawing while the text is mid-edit; show the error above it.
    const prev = host.querySelector('.mapi-view')
    const box = node('div', 'mapi-issues')
    box.append(node('div', 'mapi-issue mapi-issue-error', message))
    if (!prev) return host.replaceChildren(box)
    prev.querySelector('.mapi-issues')?.remove()
    prev.querySelector('.mapi-head').after(box)
  }

  let seq = 0
  function draw() {
    seq++
    vscode.postMessage({ type: 'draw', seq, focus: state.focus[state.focus.length - 1] || null })
  }

  window.addEventListener('message', ({ data }) => {
    if (data.type === 'changed') return draw()
    if (data.seq !== seq) return
    if (data.type === 'drawn') return paint(data.res, data.fileName)
    if (data.type === 'failed') {
      // A remembered drill-down whose group no longer exists: fall back to the whole map.
      if (state.focus.length) {
        state.focus = []
        save()
        return draw()
      }
      showError(data.message)
    }
  })

  draw()
})()
