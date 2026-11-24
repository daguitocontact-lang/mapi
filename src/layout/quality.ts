import { textWidth } from '../measure'
import type { Box, Overlap, Placed, PlacedEdge, PlacedNode } from './types'
import { BAND_LABEL_X_FROM_RIGHT, FONT_SIZE, GROUP_ICON } from './types'

type Point = [number, number]
type Segment = { a: Point; b: Point; edge: number }

const EPS = 1.5
const OWN_LABEL_GAP = 3

function intersects(p: Box, q: Box, margin = 0): boolean {
  return (
    p.x < q.x + q.w + margin && q.x < p.x + p.w + margin && p.y < q.y + q.h + margin && q.y < p.y + p.h + margin
  )
}

function isInside(id: string, groupId: string): boolean {
  return id.startsWith(`${groupId}.`)
}

function segmentsOf(edges: PlacedEdge[]): Segment[] {
  return edges.flatMap((e, edge) => e.points.slice(1).map((b, i) => ({ a: e.points[i]!, b, edge })))
}

function segmentBox(s: Segment): Box {
  const x = Math.min(s.a[0], s.b[0])
  const y = Math.min(s.a[1], s.b[1])
  return { x, y, w: Math.abs(s.a[0] - s.b[0]), h: Math.abs(s.a[1] - s.b[1]) }
}

function shrink(b: Box, by: number): Box {
  return { x: b.x + by, y: b.y + by, w: Math.max(0, b.w - by * 2), h: Math.max(0, b.h - by * 2) }
}

const isVertical = (s: Segment) => Math.abs(s.a[0] - s.b[0]) < EPS

/** Two orthogonal segments: a perpendicular crossing, a collinear overlap, or nothing. */
function relate(s: Segment, t: Segment): 'cross' | 'overlap' | null {
  const bs = segmentBox(s)
  const bt = segmentBox(t)
  if (isVertical(s) === isVertical(t)) {
    const sameLine = isVertical(s) ? Math.abs(bs.x - bt.x) < EPS : Math.abs(bs.y - bt.y) < EPS
    if (!sameLine) return null
    const [s0, s1, t0, t1] = isVertical(s) ? [bs.y, bs.y + bs.h, bt.y, bt.y + bt.h] : [bs.x, bs.x + bs.w, bt.x, bt.x + bt.w]
    return Math.min(s1, t1) - Math.max(s0, t0) > 2 ? 'overlap' : null
  }
  const [v, h] = isVertical(s) ? [bs, bt] : [bt, bs]
  const strictly = v.x > h.x + EPS && v.x < h.x + h.w - EPS && h.y > v.y + EPS && h.y < v.y + v.h - EPS
  return strictly ? 'cross' : null
}

function shareEndpoint(p: PlacedEdge, q: PlacedEdge): boolean {
  return p.from === q.from || p.from === q.to || p.to === q.from || p.to === q.to
}

/** Where a group's title (and its icon, if any) is drawn — text no line or label may cover. */
export function groupTitleBox(g: PlacedNode): Box {
  const icon = g.icon ? GROUP_ICON + 6 : 0
  return { x: g.x + 12, y: g.y + 8, w: icon + textWidth(g.label.split('\n')[0]!, FONT_SIZE - 1) + 8, h: g.icon ? GROUP_ICON + 4 : 20 }
}

function textRects(placed: Placed): Array<{ id: string; box: Box }> {
  const bands = placed.bands.map((b) => ({
    id: `layer:${b.name}`,
    box: { x: placed.width - BAND_LABEL_X_FROM_RIGHT, y: b.top, w: textWidth(b.name, FONT_SIZE), h: 24 },
  }))
  const title = placed.title
    ? [{ id: 'title', box: { x: 60, y: 38, w: textWidth(placed.title, 26), h: 36 } }]
    : []
  const labels = placed.edges.flatMap((e, i) => (e.labelBox ? [{ id: `label:e${i}`, box: e.labelBox }] : []))
  const groupTitles = placed.nodes
    .filter((n) => n.isGroup)
    .map((g) => ({ id: `group:${g.id}`, box: groupTitleBox(g) }))
  return [...bands, ...title, ...labels, ...groupTitles]
}

/** A band divider may cross lines (they pass between layers) but never a label or a box. */
function dividerOverlaps(placed: Placed): Overlap[] {
  const out: Overlap[] = []
  for (const band of placed.bands) {
    if (band.dividerY === null) continue
    const line = { x: 40, y: band.dividerY - 1, w: placed.width - 60, h: 2 }
    placed.edges.forEach((e, i) => {
      if (e.labelBox && intersects(line, e.labelBox)) out.push({ kind: 'label-collision', a: `divider:${band.name}`, b: `label:e${i}` })
    })
    for (const n of placed.nodes) {
      if (!n.isGroup && intersects(line, n)) out.push({ kind: 'line-through-box', a: `divider:${band.name}`, b: n.id })
    }
  }
  return out
}

function boxOverlaps(nodes: PlacedNode[]): Overlap[] {
  const out: Overlap[] = []
  // A reference chip belongs wherever the box it is attached to lives (inside its frames).
  const home = (n: PlacedNode) => n.attachedTo ?? n.id
  nodes.forEach((p, i) =>
    nodes.slice(i + 1).forEach((q) => {
      if (isInside(home(p), q.id) || isInside(home(q), p.id) || !intersects(p, q)) return
      const groupHit = p.isGroup !== q.isGroup
      out.push({ kind: groupHit ? 'outside-group' : 'box-box', a: p.id, b: q.id })
    }),
  )
  return out
}

function lineOverlaps(placed: Placed, texts: Array<{ id: string; box: Box }>): Overlap[] {
  const out: Overlap[] = []
  const leaves = placed.nodes.filter((n) => !n.isGroup)
  for (const s of segmentsOf(placed.edges)) {
    const edge = placed.edges[s.edge]!
    const box = segmentBox(s)
    for (const n of leaves) {
      if (n.id === edge.from || n.id === edge.to) continue
      if (intersects(box, shrink(n, 2))) out.push({ kind: 'line-through-box', a: `e${s.edge}`, b: n.id })
    }
    for (const t of texts) {
      // A label sits beside its own line but must keep a visible gap from it too.
      const own = t.id === `label:e${s.edge}`
      // Inline (context) labels sit ON their own line by design — the line is cut there.
      if (own && edge.step === null) continue
      const hit = own ? intersects(box, t.box, OWN_LABEL_GAP) : intersects(box, shrink(t.box, 1))
      if (hit) out.push({ kind: 'label-collision', a: `e${s.edge}`, b: t.id })
    }
  }
  return out
}

function textOverlaps(placed: Placed, texts: Array<{ id: string; box: Box }>): Overlap[] {
  const out: Overlap[] = []
  const leaves = placed.nodes.filter((n) => !n.isGroup)
  texts.forEach((t, i) => {
    for (const n of leaves) if (intersects(t.box, n, 2)) out.push({ kind: 'label-collision', a: t.id, b: n.id })
    for (const u of texts.slice(i + 1)) {
      if (intersects(t.box, u.box, 2)) out.push({ kind: 'label-collision', a: t.id, b: u.id })
    }
  })
  return out
}

/** Every hard-rule violation (things drawn on top of each other) plus the soft crossing count. */
export function inspect(placed: Placed): { overlaps: Overlap[]; crossings: number } {
  const texts = textRects(placed)
  const laneHits: Overlap[] = placed.lanes.flatMap((lane) =>
    placed.nodes
      .filter((n) => !n.isGroup && n.lane !== lane.name && intersects(n, lane.box))
      .map((n) => ({ kind: 'outside-group' as const, a: `lane:${lane.name}`, b: n.id })),
  )
  // A line may enter or leave a lane, but never cut straight through one.
  const laneCuts: Overlap[] = placed.lanes.flatMap((lane) => {
    const inLane = new Set(placed.nodes.filter((n) => n.lane === lane.name).map((n) => n.id))
    return segmentsOf(placed.edges)
      .filter((sg) => {
        const e = placed.edges[sg.edge]!
        return !inLane.has(e.from) && !inLane.has(e.to) && intersects(segmentBox(sg), shrink(lane.box, 2))
      })
      .map((sg) => ({ kind: 'line-through-box' as const, a: `e${sg.edge}`, b: `lane:${lane.name}` }))
  })
  // The map title is text too: no lane frame may run through it.
  const titleBox = texts.find((t) => t.id === 'title')?.box
  const laneOverTitle: Overlap[] = titleBox
    ? placed.lanes.filter((l) => intersects(l.box, titleBox)).map((l) => ({ kind: 'label-collision' as const, a: `lane:${l.name}`, b: 'title' }))
    : []
  const overlaps = [
    ...laneOverTitle,
    ...laneCuts,
    ...laneHits,
    ...boxOverlaps(placed.nodes),
    ...lineOverlaps(placed, texts),
    ...textOverlaps(placed, texts),
    ...dividerOverlaps(placed),
  ]
  const segments = segmentsOf(placed.edges)
  let crossings = 0
  segments.forEach((s, i) =>
    segments.slice(i + 1).forEach((t) => {
      if (s.edge === t.edge) return
      const p = placed.edges[s.edge]!
      const q = placed.edges[t.edge]!
      const relation = relate(s, t)
      // Lines leaving or entering the same box may run together — that reads as a bus.
      if (relation === 'overlap' && !shareEndpoint(p, q)) {
        overlaps.push({ kind: 'line-on-line', a: `e${s.edge}`, b: `e${t.edge}` })
      }
      if (relation === 'cross') crossings++
    }),
  )
  return { overlaps, crossings }
}

/** Where lines cross — the renderer draws a small hop on the horizontal one there. */
export function crossingPoints(edges: PlacedEdge[]): Array<{ edge: number; at: Point }> {
  const segments = segmentsOf(edges)
  const hops: Array<{ edge: number; at: Point }> = []
  segments.forEach((s, i) =>
    segments.slice(i + 1).forEach((t) => {
      if (s.edge === t.edge || relate(s, t) !== 'cross') return
      const [v, h] = isVertical(s) ? [s, t] : [t, s]
      hops.push({ edge: h.edge, at: [v.a[0], h.a[1]] })
    }),
  )
  return hops
}

/** Lower is better. Overlaps dominate everything, then crossings, then tidiness. */
export function score(placed: Placed): number {
  const length = placed.edges.reduce(
    (sum, e) => sum + e.points.slice(1).reduce((acc, p, i) => {
      const q = e.points[i]!
      return acc + Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1])
    }, 0),
    0,
  )
  const bends = placed.edges.reduce((sum, e) => sum + Math.max(0, e.points.length - 2), 0)
  const aspect = Math.abs(Math.log(placed.width / Math.max(placed.height, 1) / 1.4))
  // Story readability: numbered steps should flow downward with few turns.
  const story = placed.edges.filter((e) => e.step !== null)
  const storyBends = story.reduce((sum, e) => sum + Math.max(0, e.points.length - 2), 0)
  const storyUp = story.reduce((sum, e) => {
    const first = e.points[0]
    const last = e.points[e.points.length - 1]
    return first && last && last[1] < first[1] ? sum + (first[1] - last[1]) : sum
  }, 0)
  return (
    placed.overlaps.length * 1_000_000 +
    placed.crossings * 1_000 +
    bends * 8 +
    storyBends * 40 +
    storyUp * 50 +
    length * 0.1 +
    placed.width * placed.height * 0.0005 +
    aspect * 300
  )
}
