import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { viewDocument } from './focus'
import { layoutMap } from './layout'
import { parseMapi } from './parse'
import { renderMap } from './render-map'
import type { MapNode, ParseError } from './model'
import { compareSteps } from './model'
import { docFor, readDocFile } from './docs'
import type { RenderTheme } from './render/theme'
import { RENDER_THEMES, paletteFor } from './render/theme'
import { viewerPage } from './viewer-page'
import { listLibrary, resolveMapPath } from './library'
import { listVersions, readVersion, recordVersion, restoreVersion } from './history'

export const DEFAULT_PORT = 4080
// Changes on every process start; the viewer reloads itself when it sees a new one
// (the server is run under `bun --watch`, so any code edit restarts it).
const BOOT_ID = String(Date.now())

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

type RenderRequest = {
  path: string
  /** Map text to render — the current file or an older version. */
  source: string
  theme: RenderTheme
  focus: string | null
  context: boolean
  showIds: boolean
  /** Maps folder: docs may only be read from inside it. */
  root: string
}

/**
 * Dragging a box in the viewer moves it to a column: dropped near an existing column it
 * joins it, dropped between two it gets the column number in between (e.g. 1.75). The
 * change is written into the .mapi itself, so the file stays the source of truth (and the
 * watcher records it as a new version).
 */
async function moveToColumn(path: string, id: string, x: number): Promise<number | null> {
  const source = readFileSync(path, 'utf8')
  const { doc } = parseMapi(source)
  if (!doc.nodes.some((n) => n.id === id)) return null
  const placed = await layoutMap(viewDocument(doc, { focusId: null, context: false }).doc, {})
  const centres = doc.nodes
    .filter((n) => n.col !== null && n.id !== id)
    .flatMap((n) => {
      const p = placed.nodes.find((q) => q.id === n.id)
      return p ? [{ col: n.col!, x: p.x + p.w / 2 }] : []
    })
  const byCol = new Map<number, number[]>()
  for (const c of centres) byCol.set(c.col, [...(byCol.get(c.col) ?? []), c.x])
  const cols = [...byCol.entries()].map(([col, xs]) => ({ col, x: xs.reduce((a, b) => a + b, 0) / xs.length })).sort((a, b) => a.x - b.x)
  const near = cols.find((c) => Math.abs(c.x - x) < SNAP_PX)
  const left = [...cols].reverse().find((c) => c.x < x)
  const right = cols.find((c) => c.x > x)
  const col = near
    ? near.col
    : left && right
      ? Math.round(((left.col + right.col) / 2) * 100) / 100
      : left
        ? left.col + 0.5
        : Math.max(0, (right?.col ?? 0.5) - 0.5)
  const line = new RegExp(`^(\\s*${id}: [^\\n]*?)(?: \\[([^\\]]*)\\])?( \\{)?$`, 'm')
  const m = source.match(line)
  if (!m) return null
  const attrs = (m[2] ?? '').split(',').map((a) => a.trim()).filter((a) => a && !a.startsWith('col='))
  attrs.push(`col=${col}`)
  writeFileSync(path, source.replace(line, () => `${m[1]} [${attrs.join(', ')}]${m[3] ?? ''}`))
  return col
}

const SNAP_PX = 90

type Component = { id: string; label: string; about: string | null; group: string | null }

/** Pieces for the architecture side panel: top-level boxes, and groups' children under their group. */
function componentsOf(nodes: MapNode[], about: Record<string, string>, group: string | null = null): Component[] {
  return nodes.flatMap((n) => {
    if (n.style === 'text' || n.style === 'note') return []
    const name = n.label.replace(/\n/g, ' ')
    if (n.children.length > 0 && !n.collapsed) return componentsOf(n.children, about, n.label.split('\n')[0]!)
    // Children carry a qualified id (`app.web`); `about` may use either form.
    const short = n.id.split('.').pop()!
    return [{ id: n.id, label: name, about: about[n.id] ?? about[short] ?? null, group }]
  })
}

type Item = { id: string; label: string; layer: string | null; code: string | null }

function listItems(nodes: MapNode[]): Item[] {
  return nodes.flatMap((n) => [{ id: n.id, label: n.label, layer: n.layer, code: n.code }, ...listItems(n.children)])
}

/** Repo root = nearest ancestor holding `.git` (a dir, or a file in a worktree). */
function findRepoRoot(from: string): string {
  let dir = resolve(from)
  while (!existsSync(join(dir, '.git'))) {
    const up = dirname(dir)
    if (up === dir) return resolve(from)
    dir = up
  }
  return dir
}

/** A `[code=…]` anchor whose file or line no longer exists means the map went stale. */
function checkCodeAnchors(nodes: MapNode[], repoRoot: string): ParseError[] {
  return listItems(nodes).flatMap((item) => {
    if (!item.code) return []
    const [path, line] = item.code.split(':') as [string, string]
    const abs = join(repoRoot, path)
    if (!existsSync(abs)) return [{ line: 0, level: 'warning' as const, message: `${item.id}: ${path} does not exist` }]
    const lines = readFileSync(abs, 'utf8').split('\n').length
    return Number(line) > lines
      ? [{ line: 0, level: 'warning' as const, message: `${item.id}: ${path} has ${lines} lines, not ${line}` }]
      : []
  })
}

async function renderFile({ path, source, theme, focus, context, showIds, root }: RenderRequest) {
  // The viewer paints the (infinite) background itself, so the SVG ships without one.
  const { doc, view, placed, svg, placement, errors, warnings } = await renderMap(source, {
    theme,
    focus,
    context,
    showIds,
    background: false,
    readDoc: (ref) => readDocFile(path, ref, root)?.text ?? null,
  })
  const repoRoot = findRepoRoot(dirname(path))
  const palette = paletteFor(theme)
  return {
    svg,
    errors: [...errors, ...warnings, ...checkCodeAnchors(doc.nodes, repoRoot)],
    crossings: placed.crossings,
    placement,
    trail: view.trail,
    summary: doc.summary,
    kind: doc.kind,
    components: componentsOf(view.doc.nodes, doc.about),
    steps: view.doc.edges
      .filter((e) => e.step !== null && !e.outer)
      .sort((a, b) => compareSteps(a.step!, b.step!))
      .map((e) => ({ step: e.step, from: e.from, to: e.to, label: e.label })),
    items: listItems(view.doc.nodes),
    repoRoot,
    links: view.doc.edges,
    drillable: [...view.drillable],
    width: placed.width,
    height: placed.height,
    background: palette.background,
    grid: palette.grid,
    gridSize: palette.gridSize,
    gridKind: palette.gridKind,
    branches: palette.branches,
  }
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

export function startDevServer(dir: string, port = DEFAULT_PORT): void {
  const root = resolve(dir)
  const clients = new Set<ServerResponse>()
  // Every map starts with a baseline version; each later save adds one.
  for (const entry of listLibrary(root)) recordVersion(root, entry.path)
  watch(root, { recursive: true }, (_event, name) => {
    const rel = name?.split(sep).join('/')
    if (!rel?.endsWith('.mapi') || rel.startsWith('.mapi-history/')) return
    recordVersion(root, rel)
    for (const client of clients) client.write(`data: ${rel}\n\n`)
  })

  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const file = resolveMapPath(root, url.searchParams.get('file') ?? '')
    try {
      if (url.pathname === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write(`event: boot\ndata: ${BOOT_ID}\n\n`)
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (url.pathname === '/files') return json(res, listLibrary(root))
      if (url.pathname === '/resolve') return json(res, { path: file })
      if (url.pathname === '/history') return json(res, file ? listVersions(root, file) : [])
      if (url.pathname === '/move' && req.method === 'POST') {
        const id = url.searchParams.get('id') ?? ''
        const x = Number(url.searchParams.get('x'))
        if (!file || !/^[\w-]+$/.test(id) || !Number.isFinite(x)) return json(res, { ok: false }, 400)
        const col = await moveToColumn(join(root, file), id, x)
        return json(res, { ok: col !== null, col }, col === null ? 404 : 200)
      }
      if (url.pathname === '/restore' && req.method === 'POST') {
        const ok = file !== null && restoreVersion(root, file, url.searchParams.get('version') ?? '')
        return json(res, { ok }, ok ? 200 : 404)
      }
      if (url.pathname === '/doc') {
        if (!file) return json(res, { error: 'map not found' }, 404)
        const { doc } = parseMapi(readFileSync(join(root, file), 'utf8'))
        const id = url.searchParams.get('id') ?? ''
        const ref = docFor(doc, id)
        const found = ref ? readDocFile(join(root, file), ref, root) : null
        if (!ref || !found) return json(res, { error: ref ? `"${ref.path}" not found inside the maps folder` : `no doc for "${id}"` }, 404)
        return json(res, { id, path: found.path.slice(root.length + 1), section: found.section, line: found.line, text: found.text })
      }
      if (url.pathname === '/svg') {
        if (!file) return json(res, { svg: '', errors: [{ line: 0, message: 'map not found' }] }, 404)
        const version = url.searchParams.get('version')
        const source = version ? readVersion(root, file, version) : readFileSync(join(root, file), 'utf8')
        if (source === null) return json(res, { svg: '', errors: [{ line: 0, message: 'version not found' }] }, 404)
        const theme = pick(url.searchParams.get('theme'), RENDER_THEMES, 'dark')
        const focus = url.searchParams.get('focus') || null
        const context = url.searchParams.get('context') === '1'
        const showIds = url.searchParams.get('ids') === '1'
        return json(res, await renderFile({ path: join(root, file), source, theme, focus, context, showIds, root }))
      }
      const first = listLibrary(root)[0]?.path ?? ''
      const html = viewerPage(url.pathname === '/view' && file ? file : first)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[mapi] ${url.pathname} ${file}: ${message}\n`)
      json(res, { svg: '', errors: [{ line: 0, message }] }, 500)
    }
  }).listen(port, () => process.stdout.write(`Mapi dev → http://localhost:${port}  (watching ${root})\n`))
}
