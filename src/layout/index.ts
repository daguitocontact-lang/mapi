import type { MapDocument } from '../model'
import type { Candidate } from './build'
import { buildGraph, computeBands, indexNodes, readEdges, readNodes } from './build'
import { runElk } from './elk'
import { inspect, score } from './quality'
import { expandClones } from '../clones'
import { computeLanes, gridLayout } from './grid'
import type { Box, LayerBand, Placed, PlacedEdge, PlacedNode } from './types'

export * from './types'
export { crossingPoints } from './quality'

const CANDIDATES: Candidate[] = [
  { name: 'brandes-koepf', options: { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF' } },
  { name: 'network-simplex', options: { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' } },
  {
    name: 'model-order',
    options: {
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
  },
  { name: 'linear-segments', options: { 'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS' } },
]

/** A box out of its `col=` order costs more than any amount of extra line length. */
const COLUMN_VIOLATION = 1e6

/**
 * `col=` is a promise to the reader ("webhooks are the 4th column"), but ELK treats it
 * as a hint. Count pairs that sit side by side in the wrong order so scoring rejects them.
 */
function columnViolations(doc: MapDocument, placed: Placed): number {
  const pinned = doc.nodes.filter((n) => n.col !== null)
  const box = new Map(placed.nodes.map((n) => [n.id, n]))
  let bad = 0
  pinned.forEach((a, i) =>
    pinned.slice(i + 1).forEach((b) => {
      const pa = box.get(a.id)
      const pb = box.get(b.id)
      if (!pa || !pb || a.col === b.col) return
      const sideBySide = pa.y < pb.y + pb.h && pb.y < pa.y + pa.h
      if (!sideBySide) return
      const left = a.col! < b.col! ? pa : pb
      const right = left === pa ? pb : pa
      if (left.x + left.w / 2 > right.x + right.w / 2) bad++
    }),
  )
  return bad
}

const DIVIDER_CLEARANCE = 6

/**
 * ELK ignores `col=` under hierarchical layout and tends to lay columns out reversed.
 * If most column pairs come out right-to-left, mirror the drawing horizontally: a mirror
 * preserves every distance, so it can't create overlaps or crossings.
 */
function orientColumns(doc: MapDocument, nodes: PlacedNode[], edges: PlacedEdge[]): void {
  const pinned = doc.nodes.filter((n) => n.col !== null)
  const xOf = (id: string) => nodes.find((n) => n.id === id)?.x ?? 0
  let reversed = 0
  let ordered = 0
  pinned.forEach((a, i) =>
    pinned.slice(i + 1).forEach((b) => {
      if (a.col === b.col) return
      const sameWay = (a.col! - b.col!) * (xOf(a.id) - xOf(b.id)) > 0
      if (sameWay) ordered++
      else reversed++
    }),
  )
  if (reversed <= ordered) return
  const minX = Math.min(...nodes.map((n) => n.x))
  const maxX = Math.max(...nodes.map((n) => n.x + n.w))
  const flip = (x: number) => minX + maxX - x
  for (const n of nodes) n.x = flip(n.x + n.w)
  for (const e of edges) {
    e.points = e.points.map(([x, y]) => [flip(x), y])
    if (e.labelBox) e.labelBox = { ...e.labelBox, x: flip(e.labelBox.x + e.labelBox.w) }
  }
}
/** Put each band divider in the gap below the band, at the spot farthest from any edge label. */
function placeDividers(bands: LayerBand[], edges: PlacedEdge[]): LayerBand[] {
  const labels = edges.flatMap((e) => (e.labelBox ? [e.labelBox] : []))
  return bands.map((band, i) => {
    const next = bands[i + 1]
    if (!next) return band
    const lo = band.bottom + DIVIDER_CLEARANCE
    const hi = next.top - DIVIDER_CLEARANCE
    if (hi <= lo) return { ...band, dividerY: (band.bottom + next.top) / 2 }
    const blocked = labels
      .filter((b: Box) => b.y + b.h > lo && b.y < hi)
      .map((b) => [b.y - DIVIDER_CLEARANCE, b.y + b.h + DIVIDER_CLEARANCE] as const)
    let best = (lo + hi) / 2
    let bestGap = -1
    for (let y = lo; y <= hi; y += 2) {
      if (blocked.some(([a, b]) => y >= a && y <= b)) continue
      const gap = Math.min(...blocked.map(([a, b]) => Math.min(Math.abs(y - a), Math.abs(y - b))), Infinity)
      if (gap > bestGap) { bestGap = gap; best = y }
    }
    return { ...band, dividerY: best }
  })
}

/** Each round widens every spacing; stops at the first round with a clean layout. */
const SPREADS = [1, 1.4, 1.9, 2.6, 3.4]

export type LayoutOptions = { drillable?: Set<string>; showIds?: boolean }

async function attempt(doc: MapDocument, options: LayoutOptions, candidate: Candidate, spread: number) {
  const known = indexNodes(doc.nodes)
  // Dangling edges are already reported by the parser; drawing the rest beats a blank canvas.
  const edges = doc.edges.filter((e) => known.has(e.from) && known.has(e.to))
  const graph = await runElk(buildGraph({
      doc,
      edges,
      candidate,
      spread,
      showIds: options.showIds ?? false,
      stacked: options.drillable ?? new Set(),
    }))
  const nodes = readNodes(graph, { source: known, drillable: options.drillable ?? new Set() })
  const placedEdges = readEdges(graph, edges, nodes)
  orientColumns(doc, nodes, placedEdges)
  const placed: Placed = {
    title: doc.title,
    width: graph.width ?? 0,
    height: graph.height ?? 0,
    nodes,
    edges: placedEdges,
    bands: placeDividers(computeBands(doc, nodes), placedEdges),
    lanes: computeLanes(nodes),
    overlaps: [],
    crossings: 0,
  }
  return { ...placed, ...inspect(placed) }
}

/**
 * Lay the map out under the HARD rule that nothing is drawn on top of anything
 * else: every candidate strategy is tried, the cleanest/most readable one wins,
 * and spacing grows until a layout has zero overlaps. Whatever still overlaps
 * after the last round is returned in `overlaps` so the caller can surface it.
 */
/**
 * Architecture maps with `col=`: ELK sizes the boxes once, then the grid placer puts each
 * box in its exact column/band and routes the lines itself (see grid.ts).
 */
async function layoutGrid(source: MapDocument, options: LayoutOptions): Promise<Placed> {
  const known = indexNodes(source.nodes)
  const edges = source.edges.filter((e) => known.has(e.from) && known.has(e.to))
  const sized = await attempt(source, options, CANDIDATES[0]!, 1)
  let best: Placed | null = null
  for (const spread of SPREADS) {
    const g = gridLayout({ doc: source, edges, sized, spread })
    const base: Placed = {
      title: source.title,
      width: g.width,
      height: g.height,
      nodes: g.nodes,
      edges: g.edges,
      bands: placeDividers(computeBands(source, g.nodes), g.edges),
      lanes: g.lanes,
      overlaps: [],
      crossings: 0,
    }
    const placed = { ...base, ...inspect(base) }
    if (!best || placed.overlaps.length < best.overlaps.length) best = placed
    if (placed.overlaps.length === 0) return placed
  }
  return best!
}

export async function layoutMap(source: MapDocument, options: LayoutOptions): Promise<Placed> {
  const doc = expandClones(source)
  const placedByAuthor = (ns: MapDocument['nodes']): boolean => ns.some((n) => n.at !== null || placedByAuthor(n.children))
  if (placedByAuthor(doc.nodes) || (doc.kind === 'architecture' && doc.nodes.some((n) => n.col !== null))) return layoutGrid(doc, options)
  let best: Placed | null = null
  for (const spread of SPREADS) {
    const results = await Promise.all(CANDIDATES.map((c) => attempt(doc, options, c, spread)))
    const cost = (r: Placed) => score(r) + columnViolations(doc, r) * COLUMN_VIOLATION
    for (const r of results) if (!best || cost(r) < cost(best)) best = r
    if (best && best.overlaps.length === 0) return best
  }
  return best!
}
