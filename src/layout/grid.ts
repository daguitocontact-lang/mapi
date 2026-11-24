import type { MapDocument, MapEdge, MapNode } from '../model'
import { textWidth } from '../measure'
import type { Box, Lane, Placed, PlacedEdge, PlacedNode } from './types'
import { crossingPoints, groupTitleBox } from './quality'
import { BAND_LABEL_X_FROM_RIGHT, EDGE_LABEL_SIZE, GROUP_LABEL_SIZE } from './types'

/**
 * Architecture maps are read as a hand-drawn grid: `col=` is the column, the layer is the
 * row band, and inside a band boxes go down in the order the lines flow. ELK only treats
 * `col=` as a hint (and lines detour when it ignores it), so here the grid is exact: ELK
 * only sizes each box, this file places them and routes every line orthogonally with as
 * few turns as possible.
 */

type Point = [number, number]

// Top room = title plus a lane frame's own title, so a lane in the first row never climbs into it.
const PAD = { left: 60, top: 160, bottom: 60 }
const RIGHT_PAD = BAND_LABEL_X_FROM_RIGHT + 60
const COL_GAP = 110
const ROW_GAP = 70
const LAYER_GAP = 110
const LANE_PAD = 18
const LANE_TITLE = 26

/** Router grid: one cell = STEP px. A turn costs as much as BEND cells of straight line. */
const STEP = 10
const BEND = 40
const CROSS = 20
const NEAR_PARALLEL = 4
/** Choosing between routing orders, one crossing costs this many px of extra line. */
const CROSSING_PENALTY = 800
const CLEARANCE = 12
const LABEL_PAD = 6
const LABEL_H = 18
/** Where along a segment a label may sit (fraction), middle first. */
const LABEL_SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]

const topOf = (doc: MapDocument) => doc.nodes

/** Depth of each box inside its band, following the lines between boxes of that band. */
/**
 * Lines that close a loop ("the worker hands the webhook back to ingestion") are returns:
 * they must not push their target down. A line is a return when it goes to a box closer to
 * the entries (fewer steps from a box nothing feeds) AND that box can reach back to it.
 */
export function returnEdges(members: MapNode[], edges: MapEdge[]): Set<MapEdge> {
  const ids = new Set(members.map((m) => m.id))
  const inner = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
  const next = new Map<string, string[]>()
  for (const e of inner) next.set(e.from, [...(next.get(e.from) ?? []), e.to])
  const fed = new Set(inner.map((e) => e.to))
  const depth = new Map<string, number>()
  let frontier = members.filter((m) => !fed.has(m.id)).map((m) => m.id)
  frontier.forEach((id) => depth.set(id, 0))
  for (let d = 1; frontier.length > 0; d++) {
    frontier = frontier.flatMap((id) => (next.get(id) ?? []).filter((to) => !depth.has(to)))
    frontier.forEach((id) => depth.set(id, d))
  }
  const reaches = (from: string, target: string) => {
    const seen = new Set([from])
    const stack = [from]
    while (stack.length > 0) {
      for (const to of next.get(stack.pop()!) ?? []) {
        if (to === target) return true
        if (!seen.has(to)) { seen.add(to); stack.push(to) }
      }
    }
    return false
  }
  const back = new Set<MapEdge>()
  for (const e of inner) {
    const df = depth.get(e.from) ?? Infinity
    const dt = depth.get(e.to) ?? Infinity
    if (dt < df && reaches(e.to, e.from)) back.add(e)
  }
  return back
}

function ranksInBand(members: MapNode[], rawEdges: MapEdge[]): Map<string, number> {
  const ids = new Set(members.map((m) => m.id))
  // A line from a box inside a group (cf.app → balancer) ranks as a line from the group.
  const lift = (id: string) => (ids.has(id) ? id : id.split('.')[0]!)
  const edges = rawEdges.map((e) => ({ ...e, from: lift(e.from), to: lift(e.to) }))
  const back = returnEdges(members, edges)
  const inner = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to && !back.has(e))
  const rank = new Map(members.map((m) => [m.id, 0]))
  // Longest path, bounded by the member count so a cycle (a <-> b) can't loop forever.
  for (let pass = 0; pass < members.length; pass++) {
    let changed = false
    for (const e of inner) {
      const next = rank.get(e.from)! + 1
      if (next > rank.get(e.to)! && next < members.length) {
        rank.set(e.to, next)
        changed = true
      }
    }
    if (!changed) break
  }
  return rank
}

type Slot = { col: number; layer: number; rank: number }

/** Each box's (column, band, depth) — two boxes never share a slot. */
function assignSlots(doc: MapDocument, edges: MapEdge[]): Map<string, Slot> {
  const layers = doc.layers.length > 0 ? doc.layers : ['']
  const slots = new Map<string, Slot>()
  const pending: Array<{ n: MapNode; put: (n: MapNode, col: number) => void; taken: Set<string>; ranks: Map<string, number> }> = []
  layers.forEach((name, layer) => {
    // Attached chips ([clone] copies) take no slot: they ride beside the box that uses them.
    const members = topOf(doc).filter((n) => n.attachedTo === null && (n.layer ?? layers[0]) === name)
    const ranks = ranksInBand(members, edges)
    const taken = new Set<string>()
    const put = (n: MapNode, wanted: number) => {
      const rank0 = ranks.get(n.id)!
      const col = [wanted, wanted + 0.5, wanted - 0.5].find((c) => !taken.has(`${c}:${rank0}`)) ?? wanted
      let rank = rank0
      while (taken.has(`${col}:${rank}`)) rank++
      taken.add(`${col}:${rank}`)
      slots.set(n.id, { col, layer, rank })
    }
    for (const n of members) if (n.col !== null) put(n, n.col)
    pending.push(...members.filter((n) => n.col === null).map((n) => ({ n, put, taken, ranks })))
  })
  // Boxes without `col=` (e.g. stores) go next to whoever uses them: the most-connected
  // first, then the free half-column closest to their users' average — side by side with a
  // neighbour instead of hanging below it.
  const linksOf = (id: string) => edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []))
  pending.sort((a, b) => linksOf(b.n.id).length - linksOf(a.n.id).length)
  for (const { n, put, taken, ranks } of pending) {
    const cols = linksOf(n.id).flatMap((o) => (slots.has(o) ? [slots.get(o)!.col] : []))
    const target = cols.length > 0 ? cols.reduce((a, b) => a + b, 0) / cols.length : 0
    const rank = ranks.get(n.id)!
    const all = [...slots.values()].map((sl) => sl.col)
    const lo = Math.min(0, ...all) - 1
    const hi = Math.max(0, ...all) + 1
    const options: number[] = []
    for (let c = lo; c <= hi; c += 0.5) if (!taken.has(`${c}:${rank}`)) options.push(c)
    options.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
    put(n, options[0] ?? hi + 1)
  }
  return slots
}

function moveSubtree(nodes: PlacedNode[], id: string, dx: number, dy: number): void {
  for (const n of nodes) {
    if (n.id !== id && !n.id.startsWith(`${id}.`)) continue
    n.x += dx
    n.y += dy
  }
}

/** Minimum distance between the centres of two neighbouring columns. */
const COLUMN_ORDER_GAP = 120
/** Centre-to-centre px per whole column number (fractions scale it), capped. */
const COLUMN_UNIT = 1000
const MAX_COLUMN_SPACING = 500
const ASIDE_GAP = 40
const FRAME_GAP = 80
const CHIP_SIDE_GAP = 36
const CHIP_GAP_Y = 12

/** The reference chips attached to each box: the box plus its chips form one block. */
function copiesByOwner(nodes: PlacedNode[]): Map<string, PlacedNode[]> {
  const out = new Map<string, PlacedNode[]>()
  for (const c of nodes) if (c.attachedTo) out.set(c.attachedTo, [...(out.get(c.attachedTo) ?? []), c])
  return out
}

/**
 * Chips sit beside the box, never below it (the bottom stays free for the line that carries
 * the message on). Fixed sides so every box reads alike: stores on the left, services on the
 * right — the same chip is always in the same place, so two boxes compare at a glance.
 */
function chipSides(copies: PlacedNode[]): { left: PlacedNode[]; right: PlacedNode[] } {
  return { left: copies.filter((c) => c.shape === 'store'), right: copies.filter((c) => c.shape !== 'store') }
}

const stackH = (cs: PlacedNode[]) => cs.reduce((a, c) => a + c.h, 0) + CHIP_GAP_Y * Math.max(0, cs.length - 1)
const sideW = (cs: PlacedNode[]) => (cs.length > 0 ? Math.max(...cs.map((c) => c.w)) + CHIP_SIDE_GAP : 0)

type Block = { w: number; h: number; ownerDx: number }

function blockOf(owner: PlacedNode, copies: PlacedNode[]): Block {
  const { left, right } = chipSides(copies)
  return {
    w: sideW(left) + owner.w + sideW(right),
    h: Math.max(owner.h, stackH(left), stackH(right)),
    ownerDx: sideW(left),
  }
}

function placeChips(owner: PlacedNode, copies: PlacedNode[], nodes: PlacedNode[]): void {
  const { left, right } = chipSides(copies)
  const stack = (cs: PlacedNode[], xOf: (c: PlacedNode) => number) => {
    let y = owner.y + owner.h / 2 - stackH(cs) / 2
    y = Math.max(owner.y, y)
    for (const c of cs) {
      moveSubtree(nodes, c.id, xOf(c) - c.x, y - c.y)
      y += c.h + CHIP_GAP_Y
    }
  }
  stack(right, () => owner.x + owner.w + CHIP_SIDE_GAP)
  stack(left, (c) => owner.x - CHIP_SIDE_GAP - c.w)
}

/**
 * Place every top-level box (children travel with their group). Columns are exact; going
 * down, each box sits right below whatever feeds it and below the previous box of its own
 * column — columns pack independently, so a tall block elsewhere leaves no hole here.
 */
/**
 * Boxes inside a one-row group keep the order the author wrote (the sizing pass may shuffle
 * them) — "Panel a medida" first means first, next to what it connects to.
 */
function orderGroupRows(doc: MapDocument, nodes: PlacedNode[]): void {
  for (const g of doc.nodes.filter((n) => n.children.length > 1)) {
    const kids = g.children.flatMap((c) => nodes.filter((n) => n.id === c.id))
    if (kids.length !== g.children.length || kids.some((k) => Math.abs(k.y - kids[0]!.y) > 2)) continue
    const byX = [...kids].sort((a, b) => a.x - b.x)
    const gap = byX.length > 1 ? byX[1]!.x - (byX[0]!.x + byX[0]!.w) : 0
    let x = byX[0]!.x
    for (const k of kids) {
      k.x = x
      x += k.w + gap
    }
  }
}

type FirstColumn = {
  slots: Map<string, Slot>
  nodes: PlacedNode[]
  placedBlocks: Array<{ x: number; w: number; top: number; h: number }>
  gap: number
  skip: (id: string) => boolean
  lanePad: (id: string) => number
}

/**
 * Columns compact to the LEFT, so the first column stays glued to the edge and any slack
 * ends up as a hole on its right. Push it right until it meets its neighbour (normal gap);
 * the whole map is shifted back to the margin afterwards, so the hole simply disappears.
 */
function closeFirstColumnGap({ slots, nodes, placedBlocks, gap, skip, lanePad }: FirstColumn): void {
  const first = Math.min(...[...slots.entries()].filter(([id]) => !skip(id)).map(([, sl]) => sl.col))
  const ids = [...slots.entries()].filter(([id, sl]) => sl.col === first && !skip(id)).map(([id]) => id)
  if (ids.length === 0) return
  const own = (id: string) => nodes.filter((n) => n.id === id || n.id.startsWith(`${id}.`) || n.attachedTo === id)
  const extent = (id: string) => {
    const ns = own(id)
    const pad = lanePad(id)
    return { x0: Math.min(...ns.map((n) => n.x)) - pad, x1: Math.max(...ns.map((n) => n.x + n.w)) + pad, y0: Math.min(...ns.map((n) => n.y)), y1: Math.max(...ns.map((n) => n.y + n.h)) }
  }
  const mine = ids.map(extent)
  let slack = Infinity
  for (const m of mine) {
    for (const p of placedBlocks) {
      if (p.x <= m.x0 + 1 || p.top >= m.y1 + ROW_GAP || m.y0 >= p.top + p.h + ROW_GAP) continue
      slack = Math.min(slack, p.x - m.x1 - gap)
    }
  }
  if (!Number.isFinite(slack) || slack <= 1) return
  for (const id of ids) moveSubtree(nodes, id, slack, 0)
  for (const n of nodes) if (n.attachedTo && ids.includes(n.attachedTo)) { n.x += slack }
}

type TopRow = { ids: string[]; nodes: PlacedNode[]; byId: Map<string, PlacedNode>; edges: MapEdge[]; gap: number }

/**
 * The entry row has room to spare: slide each entry sideways (never into its neighbours)
 * so the box a line leaves from sits right above the box it feeds — that line then drops
 * straight down instead of bending. Smallest slide that fits wins.
 */
function straightenTopRow({ ids, nodes, byId, edges, gap }: TopRow): void {
  const top = (id: string) => (id.includes('.') ? id.split('.')[0]! : id)
  const span = (id: string) => {
    const own = nodes.filter((n) => n.id === id || n.id.startsWith(`${id}.`))
    return { x0: Math.min(...own.map((n) => n.x)), x1: Math.max(...own.map((n) => n.x + n.w)) }
  }
  const row = [...ids].sort((a, b) => span(a).x0 - span(b).x0)
  row.forEach((id, i) => {
    const shifts = edges
      .filter((e) => top(e.from) === id && !ids.includes(top(e.to)))
      .map((e) => {
        const from = byId.get(e.from)!
        const to = byId.get(e.to)
        return to ? to.x + to.w / 2 - (from.x + from.w / 2) : null
      })
      .filter((d): d is number => d !== null)
      .sort((a, b) => Math.abs(a) - Math.abs(b))
    const { x0, x1 } = span(id)
    const lo = i > 0 ? span(row[i - 1]!).x1 + gap : PAD.left
    const hi = i < row.length - 1 ? span(row[i + 1]!).x0 - gap : Infinity
    const dx = shifts.find((d) => x0 + d >= lo && x1 + d <= hi)
    if (dx) moveSubtree(nodes, id, dx, 0)
    spreadGroupOverTarget({ id, nodes, byId, edges, hi })
  })
}

const GROUP_PAD = 24

/**
 * A group's own line (Web app → balancer) leaves from the boxes inside that have no
 * line of their own. Slide those boxes right — inside the frame, which stretches — until
 * they sit over the target, so the group's line drops straight too.
 */
function spreadGroupOverTarget({ id, nodes, byId, edges, hi }: { id: string; nodes: PlacedNode[]; byId: Map<string, PlacedNode>; edges: MapEdge[]; hi: number }): void {
  const group = byId.get(id)
  if (!group?.isGroup) return
  const own = edges.find((e) => e.from === id)
  const target = own ? byId.get(own.to) : undefined
  if (!target) return
  const kids = nodes.filter((n) => n.id.startsWith(`${id}.`))
  const free = kids.filter((k) => !edges.some((e) => e.from === k.id || e.to === k.id))
  if (free.length === 0 || free.length === kids.length) return
  const x0 = Math.min(...free.map((k) => k.x))
  const x1 = Math.max(...free.map((k) => k.x + k.w))
  const shift = target.x + target.w / 2 - (x0 + x1) / 2
  if (shift <= 0 || x1 + shift + GROUP_PAD > hi) return
  for (const k of free) k.x += shift
  group.w = Math.max(...kids.map((k) => k.x + k.w)) + GROUP_PAD - group.x
}

/**
 * A frame's height comes from the pre-layout size, which can reserve rows its boxes no
 * longer use once the grid lays them out. Trim the empty strip at the bottom (deepest
 * frames first, so a parent sees its children's final size); boxes never move.
 */
function fitGroupsToChildren(nodes: PlacedNode[]): void {
  const groups = nodes.filter((n) => n.isGroup).sort((a, b) => b.id.split('.').length - a.id.split('.').length)
  for (const g of groups) {
    const kids = nodes.filter((n) => n.id.startsWith(`${g.id}.`) && n.id.split('.').length === g.id.split('.').length + 1)
    if (kids.length === 0) continue
    // Reference chips of a box inside the frame live inside it too.
    const kidIds = new Set(kids.map((k) => k.id))
    const held = [...kids, ...nodes.filter((n) => n.attachedTo !== null && kidIds.has(n.attachedTo))]
    const needed = Math.max(...held.map((k) => k.y + k.h)) + GROUP_PAD - g.y
    if (needed < g.h) g.h = needed
  }
}

/**
 * Chips of a box INSIDE a group (aws.api → Stripe, Zoho…) ride beside that box like any
 * other, and every frame around it widens to hold them; without this they stayed at the
 * origin, top-left of the map.
 */
function placeNestedChips({ copies, slots, byId, nodes }: { copies: Map<string, PlacedNode[]>; slots: Map<string, Slot>; byId: Map<string, PlacedNode>; nodes: PlacedNode[] }): void {
  for (const [owner, chips] of copies) {
    const box = byId.get(owner)
    if (slots.has(owner) || !box) continue
    placeChips(box, chips, nodes)
    const parts = owner.split('.')
    for (let depth = parts.length - 1; depth >= 1; depth--) {
      const frame = byId.get(parts.slice(0, depth).join('.'))
      if (!frame?.isGroup) continue
      const left = Math.min(...chips.map((c) => c.x)) - GROUP_PAD
      const right = Math.max(...chips.map((c) => c.x + c.w)) + GROUP_PAD
      if (left < frame.x) { frame.w += frame.x - left; frame.x = left }
      if (right > frame.x + frame.w) frame.w = right - frame.x
    }
  }
}

function placeBoxes(doc: MapDocument, sized: PlacedNode[], edges: MapEdge[], spread: number) {
  const nodes = sized.map((n) => ({ ...n }))
  orderGroupRows(doc, nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const slots = assignSlots(doc, edges)
  const copies = copiesByOwner(nodes)
  const blockFor = (id: string) => blockOf(byId.get(id)!, copies.get(id) ?? [])
  const cols = [...new Set([...slots.values()].map((sl) => sl.col))].sort((a, b) => a - b)
  const colW = new Map(cols.map((c) => [c, 0]))
  // The BOX sits on the column axis; its chips hang to the sides without pulling it off.
  // So a column is twice as wide as the farthest reach from a box's centre.
  const reach = (id: string) => {
    const b = blockFor(id)
    const centre = b.ownerDx + byId.get(id)!.w / 2
    return Math.max(centre, b.w - centre)
  }
  for (const [id, sl] of slots) colW.set(sl.col, Math.max(colW.get(sl.col)!, reach(id) * 2))
  // Boxes with no line and no chips are asides (public sites, ops…): a last row of their
  // own, so they don't pose as entries in the top row.
  // A line to a box inside a group (cf.app) also links the group itself, otherwise a
  // group whose lines all go to its children would sink to the aside row.
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]).flatMap((id) => [id, id.split('.')[0]!]))
  // Notes are never asides: they explain the box beside them and must stay there.
  // With layer bands the band already says where a box belongs — no aside row there.
  const banded = doc.layers.length > 1
  const pinOf = (id: string) => doc.nodes.find((n) => n.id === id)?.pin ?? null
  const aside = (id: string) =>
    pinOf(id) === 'bottom' || (!banded && pinOf(id) !== 'top' && !linked.has(id) && !copies.has(id) && byId.get(id)!.style !== 'text')
  const pinnedTop = (id: string) => pinOf(id) === 'top'
  const order = [...slots.entries()].sort(
    ([ia, a], [ib, b]) =>
      Number(aside(ia)) - Number(aside(ib)) ||
      Number(pinnedTop(ib)) - Number(pinnedTop(ia)) ||
      a.layer - b.layer ||
      a.rank - b.rank ||
      a.col - b.col,
  )
  // A line from a box inside a group counts as coming from the group (its placed block).
  const blockOfId = (id: string) => (slots.has(id) ? id : id.split('.')[0]!)
  const hasTopRow = [...slots.keys()].some(pinnedTop)
  const returns = returnEdges(doc.nodes, edges)
  // Top-row boxes outside a group line up with the boxes INSIDE the top-row groups (which
  // sit below the group title), so the whole entry row reads as one aligned line.
  const topGroups = [...slots.keys()].filter((id) => pinOf(id) === 'top' && byId.get(id)!.isGroup)
  const topInset = Math.max(
    0,
    ...topGroups.map((g) => {
      const kids = nodes.filter((n) => n.id.startsWith(`${g}.`))
      return kids.length > 0 ? Math.min(...kids.map((k) => k.y)) - byId.get(g)!.y : 0
    }),
  )
  const rowPinned = (id: string) => doc.nodes.some((n) => n.id === id && n.row)
  /** Stack every box top-down (columns pack independently); `minTop` lifts a floor per box. */
  const stackRows = (minTop: Map<string, number>) => {
    let belowTopRow: number | null = null
    let asideFloor: number | null = null
    const asideCursor = new Map<number, number>()
    const bottom = new Map<string, number>()
    const tops = new Map<string, number>()
    const cursor = new Map<number, number>()
    let layer = -1
    let floor = PAD.top
    for (const [id, sl] of order) {
      if (sl.layer !== layer) {
        if (layer >= 0) floor = Math.max(floor, ...bottom.values()) + LAYER_GAP * spread
        layer = sl.layer
      }
      if (aside(id) && asideFloor === null) asideFloor = Math.max(floor, ...bottom.values()) + LAYER_GAP * spread
      if (asideFloor !== null) floor = asideFloor
      const n = byId.get(id)!
      const b = blockFor(id)
      // A labelled line needs room for its label between the two boxes.
      const gapFor = (e: MapEdge) => ROW_GAP * spread + (e.label ? LABEL_H + LABEL_PAD * 2 : 0)
      // A box hanging from a feeder in its own column sits below it; other feeders may then
      // sit beside it (their line comes in from the side), never above their top. A box with no
      // feeder in its own column sits below all of them — the flow keeps reading downward.
      const sameColumn = (from: string) => Math.abs((slots.get(from)?.col ?? Infinity) - sl.col) < 0.5
      // A line between two boxes the author put on rows comes in from the side: rows, not the
      // line, decide their heights (otherwise a two-way pair pushes each other down forever).
      const sideOfRows = (from: string) => !sameColumn(from) && rowPinned(id) && rowPinned(from)
      const fedBy = edges.filter(
        (e) => e.to === id && !returns.has(e) && bottom.has(blockOfId(e.from)) && !sideOfRows(blockOfId(e.from)),
      )
      const anchored = fedBy.some((e) => sameColumn(blockOfId(e.from)))
      const feeds = fedBy.map((e) => {
        const from = blockOfId(e.from)
        return !anchored || sameColumn(from) ? bottom.get(from)! + gapFor(e) : tops.get(from)!
      })
      // Only the [top] entries share the first row; everything else starts below it.
      if (hasTopRow && !pinnedTop(id) && belowTopRow === null) {
        belowTopRow = Math.max(...[...slots.keys()].filter(pinnedTop).map((t) => bottom.get(t) ?? floor)) + ROW_GAP * spread
      }
      if (belowTopRow !== null && !pinnedTop(id)) floor = Math.max(floor, belowTopRow)
      const top0 =
        asideFloor !== null
          ? Math.max(asideFloor, asideCursor.get(sl.col) ?? asideFloor)
          : pinOf(id) === 'top'
            ? floor + (byId.get(id)!.isGroup ? 0 : topInset)
            : Math.max(floor, cursor.get(sl.col) ?? floor, ...feeds)
      const top = Math.max(top0, minTop.get(id) ?? -Infinity)
      if (asideFloor !== null) asideCursor.set(sl.col, top + b.h + ROW_GAP * spread)
      tops.set(id, top)
      bottom.set(id, top + b.h)
      cursor.set(sl.col, top + b.h + ROW_GAP * spread)
    }
    return { tops, bottom }
  }
  // The same real resource drawn twice ([same=…]) sits at one height: the higher drawing
  // comes down to the lower one (and whatever hangs below it follows).
  let { tops, bottom } = stackRows(new Map())
  // …and so do boxes the author put on one [row=…].
  const sameGroups = new Map<string, string[]>()
  const rowOf = (id: string) => doc.nodes.find((n) => n.id === id)?.row ?? null
  for (const id of slots.keys()) {
    const ref = byId.get(id)!.cloneOf
    if (ref && !byId.get(id)!.attachedTo) sameGroups.set(`same:${ref}`, [...(sameGroups.get(`same:${ref}`) ?? []), id])
    const row = rowOf(id)
    if (row) sameGroups.set(`row:${row}`, [...(sameGroups.get(`row:${row}`) ?? []), id])
  }
  const align = new Map<string, number>()
  for (let pass = 0; pass < 12; pass++) {
    let changed = false
    for (const ids of sameGroups.values()) {
      if (ids.length < 2) continue
      const level = Math.max(...ids.map((i) => tops.get(i)!))
      for (const i of ids) {
        if ((align.get(i) ?? -Infinity) < level) { align.set(i, level); changed = true }
      }
    }
    if (!changed) break
    ;({ tops, bottom } = stackRows(align))
  }
  // Columns go left → right, each as far left as the boxes BESIDE it (same height) allow —
  // a wide block in one row no longer leaves an empty strip in every other row.
  const placedBlocks: Array<{ x: number; w: number; top: number; h: number }> = []
  const offset = (id: string, c: number) => colW.get(c)! / 2 - (blockFor(id).ownerDx + byId.get(id)!.w / 2)
  const lanePad = (id: string) => (byId.get(id)!.lane ? LANE_PAD : 0)
  // Column order is a promise: a column may slide left, but never past the one before it.
  let prevCentre = -Infinity
  let prevCol = -Infinity
  for (const c of cols) {
    const members = [...slots.entries()].filter(([id, sl]) => sl.col === c && !aside(id)).map(([id]) => id)
    if (members.length === 0) continue
    // The column number counts: col=1.85 sits farther from col=1.5 than col=1.6 does.
    const minGap = Math.min(MAX_COLUMN_SPACING, Math.max(COLUMN_ORDER_GAP, (c - prevCol) * COLUMN_UNIT))
    let x = Math.max(PAD.left, prevCentre + minGap - colW.get(c)! / 2)
    for (const id of members) {
      const b = blockFor(id)
      const top = tops.get(id)!
      for (const p of placedBlocks) {
        if (p.top >= top + b.h + ROW_GAP || top >= p.top + p.h + ROW_GAP) continue
        x = Math.max(x, p.x + p.w + COL_GAP * spread + lanePad(id) - offset(id, c))
      }
    }
    prevCentre = x + colW.get(c)! / 2
    prevCol = c
    for (const id of members) {
      const b = blockFor(id)
      const bx = x + offset(id, c)
      placedBlocks.push({ x: bx - lanePad(id), w: b.w + lanePad(id) * 2, top: tops.get(id)!, h: b.h })
      const n = byId.get(id)!
      moveSubtree(nodes, id, bx + b.ownerDx - n.x, tops.get(id)! - n.y)
      placeChips(n, copies.get(id) ?? [], nodes)
    }
  }
  // A lane frame next to a block needs less air than two columns of boxes with lines.
  closeFirstColumnGap({ slots, nodes, placedBlocks, gap: FRAME_GAP * spread, skip: (id) => aside(id) || pinnedTop(id), lanePad })
  straightenTopRow({ ids: [...slots.keys()].filter(pinnedTop), nodes, byId, edges, gap: COL_GAP * spread })
  // Asides form one tidy footnote row: left-aligned, evenly spaced, in the order written.
  // An aside the author gave a column (`[bottom, col=…]`) sits centred under that column.
  const columnCentre = (c: number) => {
    const members = [...slots.entries()].filter(([id, sl]) => sl.col === c && !aside(id)).map(([id]) => byId.get(id)!)
    if (members.length === 0) return null
    return members.reduce((sum, m) => sum + m.x + m.w / 2, 0) / members.length
  }
  let ax = PAD.left
  for (const id of [...slots.keys()].filter(aside)) {
    const n = byId.get(id)!
    const wanted = doc.nodes.find((d) => d.id === id)?.col
    const centre = wanted != null ? columnCentre(slots.get(id)!.col) : null
    const x = centre !== null ? Math.max(ax, centre - n.w / 2) : ax
    moveSubtree(nodes, id, x - n.x, tops.get(id)! - n.y)
    placedBlocks.push({ x, w: n.w, top: tops.get(id)!, h: n.h })
    ax = x + n.w + ASIDE_GAP
  }
  placeNestedChips({ copies, slots, byId, nodes })
  fitGroupsToChildren(nodes)
  const lanePadMax = nodes.some((n) => n.lane) ? LANE_PAD : 0
  const shiftLeft = Math.min(...nodes.map((n) => n.x)) - lanePadMax - PAD.left
  if (shiftLeft > 0) for (const n of nodes) n.x -= shiftLeft
  const right = Math.max(...nodes.map((n) => n.x + n.w)) + lanePadMax
  const height = Math.max(PAD.top, ...bottom.values()) + PAD.bottom
  return { nodes, width: right + RIGHT_PAD, height }
}

/** Same cell size as the viewer rulers and the placement text, so `at=B3` means what you see. */
const AT_CELL = 200
const AT_INSET = 8
/** Free placement starts below the map title. */
const AT_TOP = 100

/**
 * "B3" → the ruler cell (col B, row 3): a box is centred in it, a range covers whole cells.
 * "4.3/2" → an exact point in cell units (0-based): a box is centred ON it, a range's two
 * points are the frame's exact corners. Numbers make copying an existing diagram easy.
 */
function cellBox(ref: string): { x0: number; y0: number; x1: number; y1: number } {
  const num = ref.match(/^([\d.]+)\/([\d.]+)$/)
  if (num) {
    const x = Number(num[1]) * AT_CELL
    const y = Number(num[2]) * AT_CELL
    return { x0: x, y0: y, x1: x, y1: y }
  }
  const m = ref.match(/^([A-Z]+)(\d+)$/)!
  const c = [...m[1]!].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  const r = Number(m[2]) - 1
  return { x0: c * AT_CELL, y0: r * AT_CELL, x1: (c + 1) * AT_CELL, y1: (r + 1) * AT_CELL }
}

function flatten(nodes: MapNode[]): MapNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)])
}

/**
 * The author placed every box on the ruler grid ([at=…]): honour it exactly. A single cell
 * centres the box in it; a range "A1:D8" is a group's frame. Boxes without `at` inside a
 * placed group keep their spot relative to it. Lines are routed afterwards as usual.
 */
function placeFree(doc: MapDocument, sized: PlacedNode[]) {
  const nodes = sized.map((n) => ({ ...n }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const m of flatten(doc.nodes)) {
    const n = byId.get(m.id)
    if (!n || !m.at) continue
    const [a, b] = m.at.split(':') as [string, string | undefined]
    const p = cellBox(a)
    const q = b ? cellBox(b) : p
    const x0 = Math.min(p.x0, q.x0)
    const y0 = Math.min(p.y0, q.y0)
    const x1 = Math.max(p.x1, q.x1)
    const y1 = Math.max(p.y1, q.y1)
    if (n.isGroup && b) {
      moveSubtree(nodes, n.id, x0 + AT_INSET - n.x, y0 + AT_TOP + AT_INSET - n.y)
      n.w = x1 - x0 - AT_INSET * 2
      n.h = y1 - y0 - AT_INSET * 2
      continue
    }
    moveSubtree(nodes, n.id, (x0 + x1) / 2 - n.w / 2 - n.x, AT_TOP + (y0 + y1) / 2 - n.h / 2 - n.y)
  }
  // Boxes the author didn't place (drill-in ghosts of other worlds) stack on the right.
  const placed = new Set(flatten(doc.nodes).filter((m) => m.at).map((m) => m.id))
  const loose = doc.nodes.filter((m) => !placed.has(m.id))
  let rightEdge = Math.max(...nodes.filter((n) => placed.has(n.id.split('.')[0]!) || placed.has(n.id)).map((n) => n.x + n.w), PAD.left)
  let y = AT_TOP + AT_INSET
  for (const m of loose) {
    const n = byId.get(m.id)
    if (!n) continue
    moveSubtree(nodes, n.id, rightEdge + COL_GAP - n.x, y - n.y)
    y += n.h + ROW_GAP
  }
  rightEdge = Math.max(...nodes.map((n) => n.x + n.w))
  const width = rightEdge + PAD.left
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + PAD.bottom
  return { nodes, width, height }
}

export function computeLanes(nodes: PlacedNode[]): Lane[] {
  const names = [...new Set(nodes.flatMap((n) => (n.lane ? [n.lane] : [])))]
  return names.map((name) => {
    const members = nodes.filter((n) => n.lane === name)
    const x0 = Math.min(...members.map((n) => n.x)) - LANE_PAD
    const y0 = Math.min(...members.map((n) => n.y)) - LANE_PAD - LANE_TITLE
    const x1 = Math.max(...members.map((n) => n.x + n.w)) + LANE_PAD
    const y1 = Math.max(...members.map((n) => n.y + n.h)) + LANE_PAD
    return { name, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
  })
}

// ---------------------------------------------------------------- routing

const DIRS: Point[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
/** Where on a side a line may attach (fraction of the side), centre first. */
const PORT_SPOTS = [0.5, 0.3, 0.7, 0.15, 0.85]

type Grid = {
  cols: number
  rows: number
  /** Edges occupying each cell, per axis (0 = horizontal, 1 = vertical). */
  used: [Array<Set<number> | undefined>, Array<Set<number> | undefined>]
}

type Port = { cell: number; dir: number; border: Point; cost: number }

class Heap {
  private items: Array<[number, number]> = []
  get size() { return this.items.length }
  push(item: [number, number]) {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p]![0] <= a[i]![0]) break
      ;[a[p], a[i]] = [a[i]!, a[p]!]
      i = p
    }
  }
  pop(): [number, number] {
    const a = this.items
    const top = a[0]!
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l]![0] < a[m]![0]) m = l
        if (r < a.length && a[r]![0] < a[m]![0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i]!, a[m]!]
        i = m
      }
    }
    return top
  }
}

/** Exit/entry points on a box border: side centres, preferring the downward flow. */
function portsOf(box: Box, grid: Grid, entering: boolean, other?: Box): Port[] {
  // A spot exactly in line with the other box's centre lets a line drop dead straight.
  const ox = other ? other.x + other.w / 2 : NaN
  const aligned = Number.isFinite(ox) && ox > box.x + 8 && ox < box.x + box.w - 8 ? (ox - box.x) / box.w : null
  const spots = aligned === null ? PORT_SPOTS : [aligned, ...PORT_SPOTS]
  const sides: Array<{ border: Point; out: number; cost: number }> = spots.flatMap((t, i) => {
    const x = box.x + box.w * t
    const y = box.y + box.h * t
    const off = i * 2
    return [
      { border: [x, box.y + box.h] as Point, out: 1, cost: (entering ? 30 : 0) + off },
      { border: [x, box.y] as Point, out: 3, cost: (entering ? 0 : 30) + off },
      { border: [box.x, y] as Point, out: 2, cost: 12 + off },
      { border: [box.x + box.w, y] as Point, out: 0, cost: 12 + off },
    ]
  })
  return sides.flatMap(({ border, out, cost }) => {
    const [dx, dy] = DIRS[out]!
    const gx = Math.round((border[0] + dx * STEP) / STEP)
    const gy = Math.round((border[1] + dy * STEP) / STEP)
    if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return []
    // Entering, the path arrives moving AGAINST the side's outward direction.
    const dir = entering ? (out + 2) % 4 : out
    return [{ cell: gy * grid.cols + gx, dir, border, cost }]
  })
}

function blockedCells(grid: Grid, boxes: Box[]): Uint8Array {
  const blocked = new Uint8Array(grid.cols * grid.rows)
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor((b.x - CLEARANCE) / STEP))
    const y0 = Math.max(0, Math.floor((b.y - CLEARANCE) / STEP))
    const x1 = Math.min(grid.cols - 1, Math.ceil((b.x + b.w + CLEARANCE) / STEP))
    const y1 = Math.min(grid.rows - 1, Math.ceil((b.y + b.h + CLEARANCE) / STEP))
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) blocked[gy * grid.cols + gx] = 1
  }
  return blocked
}

type RouteJob = { index: number; from: Box; to: Box; obstacles: Box[]; shares: Set<number> }

/** Cheapest orthogonal path: length + turns + crossings; never on top of another line. */
function route(grid: Grid, job: RouteJob): Point[] | null {
  const blocked = blockedCells(grid, job.obstacles)
  const starts = portsOf(job.from, grid, false, job.to)
  const goals = portsOf(job.to, grid, true, job.from)
  const goalAt = new Map(goals.map((g) => [g.cell, g]))
  const total = grid.cols * grid.rows * 4
  const cost = new Float64Array(total).fill(Infinity)
  const prev = new Int32Array(total).fill(-1)
  const heap = new Heap()
  const [tx, ty] = [Math.round((job.to.x + job.to.w / 2) / STEP), Math.round((job.to.y + job.to.h / 2) / STEP)]
  const guess = (cell: number) => Math.abs((cell % grid.cols) - tx) + Math.abs(Math.floor(cell / grid.cols) - ty)
  for (const s of starts) {
    if (blocked[s.cell] && !goalAt.has(s.cell)) continue
    const state = s.cell * 4 + s.dir
    cost[state] = s.cost
    heap.push([s.cost + guess(s.cell), state])
  }
  while (heap.size > 0) {
    const [, state] = heap.pop()
    const cell = state >> 2
    const dir = state & 3
    const goal = goalAt.get(cell)
    if (goal && goal.dir === dir) return tracePath(grid, prev, state, job, starts, goal)
    const gx = cell % grid.cols
    const gy = Math.floor(cell / grid.cols)
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue
      const nx = gx + DIRS[nd]![0]
      const ny = gy + DIRS[nd]![1]
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue
      const next = ny * grid.cols + nx
      if (blocked[next] && !goalAt.has(next)) continue
      const step = stepCost(grid, next, nd, job.shares)
      if (step === Infinity) continue
      const c = cost[state]! + step + (nd === dir ? 0 : BEND)
      const ns = next * 4 + nd
      if (c >= cost[ns]!) continue
      cost[ns] = c
      prev[ns] = state
      heap.push([c + guess(next), ns])
    }
  }
  return null
}

function stepCost(grid: Grid, cell: number, dir: number, shares: Set<number>): number {
  const axis = (dir % 2) as 0 | 1
  const other = (1 - axis) as 0 | 1
  const same = grid.used[axis][cell]
  if (same) for (const e of same) if (!shares.has(e)) return Infinity
  let c = 1
  if (grid.used[other][cell]?.size) c += CROSS
  const [dx, dy] = axis === 0 ? [0, grid.cols] : [1, 0]
  for (const side of [cell - dx - dy, cell + dx + dy]) if (grid.used[axis][side]?.size) c += NEAR_PARALLEL
  return c
}

function tracePath(grid: Grid, prev: Int32Array, end: number, job: RouteJob, starts: Port[], goal: Port): Point[] {
  const cells: number[] = []
  for (let s = end; s !== -1; s = prev[s]!) cells.push(s)
  cells.reverse()
  const first = cells[0]! >> 2
  const start = starts.find((p) => p.cell === first && p.dir === (cells[0]! & 3)) ?? starts[0]!
  const pts: Point[] = [start.border]
  for (const s of cells) {
    const cell = s >> 2
    pts.push([(cell % grid.cols) * STEP, Math.floor(cell / grid.cols) * STEP])
  }
  pts.push(goal.border)
  mark(grid, cells, job.index)
  return simplify(snapEnds(pts))
}

/** The first/last cell is on the grid; slide the border point so the stub stays straight. */
function snapEnds(pts: Point[]): Point[] {
  const out = pts.map((p) => [...p] as Point)
  const fix = (border: Point, near: Point) => {
    if (Math.abs(border[0] - near[0]) < Math.abs(border[1] - near[1])) border[0] = near[0]
    else border[1] = near[1]
  }
  if (out.length > 2) {
    fix(out[0]!, out[1]!)
    fix(out[out.length - 1]!, out[out.length - 2]!)
  }
  return out
}

function mark(grid: Grid, states: number[], edge: number): void {
  for (let i = 0; i < states.length; i++) {
    const cell = states[i]! >> 2
    const axis = ((states[i]! & 3) % 2) as 0 | 1
    // A turning cell is used by both axes.
    const turns = i + 1 < states.length && (states[i + 1]! & 3) % 2 !== axis
    const axes: Array<0 | 1> = turns ? [axis, (1 - axis) as 0 | 1] : [axis]
    for (const a of axes) (grid.used[a][cell] ??= new Set()).add(edge)
  }
}

function simplify(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    if (out.length > 0 && out[out.length - 1]![0] === p[0] && out[out.length - 1]![1] === p[1]) continue
    if (out.length >= 2) {
      const a = out[out.length - 2]!
      const b = out[out.length - 1]!
      if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) out.pop()
    }
    out.push(p)
  }
  return out
}

// ---------------------------------------------------------------- labels

/**
 * Two lines entering the same side of one box cross when the one that turns in closer to the
 * box takes the far spot. Swapping their entry spots removes the crossing.
 */
function untangleEntries(
  points: Map<number, Point[]>,
  edges: MapEdge[],
  leaves: Box[],
  cost: (p: Map<number, Point[]>) => number,
): Map<number, Point[]> {
  const entry = (pts: Point[]) => {
    if (pts.length < 3) return null
    const [px, py] = pts[pts.length - 2]!
    const [lx, ly] = pts[pts.length - 1]!
    if (py === ly && px !== lx) return { axis: 1 as const, side: lx, at: ly }
    if (px === lx && py !== ly) return { axis: 0 as const, side: ly, at: lx }
    return null
  }
  const withEntry = (pts: Point[], axis: 0 | 1, at: number): Point[] => {
    const out = pts.map((p) => [...p] as Point)
    out[out.length - 1]![axis] = at
    out[out.length - 2]![axis] = at
    return out
  }
  const hitsBox = (pts: Point[], from: string, to: string) =>
    segmentBoxes(pts.slice(-3)).some((sg) =>
      leaves.some((b) => {
        const id = (b as { id?: string }).id
        if (id === from || id === to) return false
        return sg.x < b.x + b.w && sg.x + sg.w > b.x && sg.y < b.y + b.h && sg.y + sg.h > b.y
      }),
    )
  let best = points
  let bestCost = cost(points)
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i]!.to !== edges[j]!.to) continue
      const a = best.get(i)
      const b = best.get(j)
      const ea = a && entry(a)
      const eb = b && entry(b)
      if (!a || !b || !ea || !eb || ea.axis !== eb.axis || ea.side !== eb.side) continue
      const na = withEntry(a, ea.axis, eb.at)
      const nb = withEntry(b, eb.axis, ea.at)
      if (hitsBox(na, edges[i]!.from, edges[i]!.to) || hitsBox(nb, edges[j]!.from, edges[j]!.to)) continue
      const trial = new Map(best)
      trial.set(i, na)
      trial.set(j, nb)
      const c = cost(trial)
      if (c < bestCost) {
        best = trial
        bestCost = c
      }
    }
  }
  return best
}

function segmentBoxes(points: Point[]): Box[] {
  return points.slice(1).map((b, i) => {
    const a = points[i]!
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) }
  })
}

const hits = (p: Box, q: Box, m: number) =>
  p.x < q.x + q.w + m && q.x < p.x + p.w + m && p.y < q.y + q.h + m && q.y < p.y + p.h + m

/** Beside its own line, clear of every box, label and other line; longest segment first. */
function placeLabel(points: Point[], w: number, avoid: { boxes: Box[]; lines: Box[] }): Box {
  const segs = points.slice(1).map((b, i) => [points[i]!, b] as const)
  segs.sort(([a, b], [c, d]) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) - (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])))
  const own = segmentBoxes(points)
  let fallback: Box | null = null
  for (const [a, b] of segs) {
    const vertical = a[0] === b[0]
    for (const t of LABEL_SPOTS) {
      const mx = a[0] + (b[0] - a[0]) * t
      const my = a[1] + (b[1] - a[1]) * t
      const options: Box[] = vertical
        ? [{ x: mx + LABEL_PAD, y: my - LABEL_H / 2, w, h: LABEL_H }, { x: mx - LABEL_PAD - w, y: my - LABEL_H / 2, w, h: LABEL_H }]
        : [{ x: mx - w / 2, y: my - LABEL_H - LABEL_PAD, w, h: LABEL_H }, { x: mx - w / 2, y: my + LABEL_PAD, w, h: LABEL_H }]
      for (const box of options) {
        fallback ??= box
        if (avoid.boxes.some((o) => hits(box, o, 4))) continue
        if (avoid.lines.some((o) => hits(box, o, 2))) continue
        if (own.some((o) => hits(box, o, 3))) continue
        return box
      }
    }
  }
  // Last resort: ON its own line, like a pill that cuts it (allowed for unnumbered lines).
  for (const [a, b] of segs) {
    for (const t of LABEL_SPOTS) {
      const mx = a[0] + (b[0] - a[0]) * t
      const my = a[1] + (b[1] - a[1]) * t
      const box = { x: mx - w / 2, y: my - LABEL_H / 2, w, h: LABEL_H }
      if (avoid.boxes.some((o) => hits(box, o, 4)) || avoid.lines.some((o) => hits(box, o, 2))) continue
      return box
    }
  }
  return fallback!
}

// ---------------------------------------------------------------- entry

export type GridInput = { doc: MapDocument; edges: MapEdge[]; sized: Placed; spread: number }

export function gridLayout({ doc, edges, sized, spread }: GridInput) {
  const placedByAuthor = flatten(doc.nodes).some((n) => n.at !== null)
  const { nodes, width, height } = placedByAuthor ? placeFree(doc, sized.nodes) : placeBoxes(doc, sized.nodes, edges, spread)
  const lanes = computeLanes(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const leaves = nodes.filter((n) => !n.isGroup)
  const groups = nodes.filter((n) => n.isGroup)
  const routable = edges
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => byId.has(e.from) && byId.has(e.to))
    .sort((p, q) => manhattan(byId, p.e) - manhattan(byId, q.e))
  /** Route every line in the given order on a fresh grid (earlier lines get the best tracks). */
  const routeAll = (order: typeof routable) => {
    const grid: Grid = { cols: Math.ceil(width / STEP) + 1, rows: Math.ceil(height / STEP) + 1, used: [[], []] }
    const points = new Map<number, Point[]>()
    for (const { e, index } of order) {
      const touches = (id: string) => id === e.from || id === e.to
      const inside = (id: string) => [e.from, e.to].some((end) => id.startsWith(`${end}.`))
      // A line that starts or ends INSIDE a group may cross that group's frame.
      const holds = (groupId: string) => [e.from, e.to].some((end) => end.startsWith(`${groupId}.`))
      const obstacles = [
        ...leaves.filter((n) => !touches(n.id)),
        ...groups.filter((g) => !touches(g.id) && !inside(g.id) && !holds(g.id)),
        ...lanes.filter((l) => !touches(laneMember(nodes, l, e.from)) && !touches(laneMember(nodes, l, e.to))).map((l) => l.box),
        ...(placedByAuthor ? [] : [{ x: width - RIGHT_PAD + 40, y: 0, w: RIGHT_PAD, h: height }]),
        // A group's title is text: no line may run over "Customer account".
        ...groups.map((g) => groupTitleBox(g)),
      ]
      // No shared tracks, even between lines of the same box: each one is followable end to end.
      const from = byId.get(e.from)!
      const to = byId.get(e.to)!
      points.set(index, route(grid, { index, from, to, obstacles, shares: new Set() }) ?? straight(from, to))
    }
    return points
  }
  const asEdges = (points: Map<number, Point[]>) =>
    edges.map((e, i) => ({ from: e.from, to: e.to, points: points.get(i) ?? [], label: null, labelBox: null, kind: e.kind, step: e.step, outer: false }))
  const cost = (points: Map<number, Point[]>) => {
    const length = [...points.values()].reduce((a, pts) => a + segmentBoxes(pts).reduce((b, sg) => b + sg.w + sg.h, 0), 0)
    return crossingPoints(asEdges(points)).length * CROSSING_PENALTY + length
  }
  // Order matters (the first line takes the best entry), so lines in a crossing get a turn
  // to go first; the order with the fewest crossings wins.
  let points = routeAll(routable)
  let best = cost(points)
  const crossers = [...new Set(crossingPoints(asEdges(points)).map((c) => c.edge))]
  for (const i of crossers) {
    const order = [...routable.filter((r) => r.index === i), ...routable.filter((r) => r.index !== i)]
    const trial = routeAll(order)
    const c = cost(trial)
    if (c < best) {
      best = c
      points = trial
    }
  }
  points = untangleEntries(points, edges, leaves, cost)
  const placedEdges: PlacedEdge[] = edges.map((e, i) => ({
    from: e.from,
    to: e.to,
    points: points.get(i) ?? [],
    label: e.label,
    labelBox: null,
    kind: e.kind,
    step: e.step,
    outer: e.outer ?? false,
  }))
  // Group titles are text too: a line label must not sit on a group title.
  const groupTitles = groups.map((g) => groupTitleBox(g))
  const placedLabels: Box[] = []
  placedEdges.forEach((pe, i) => {
    if (!pe.label || pe.points.length < 2) return
    const w = textWidth(pe.label, EDGE_LABEL_SIZE) + 8
    const lines = placedEdges.flatMap((o, j) => (j === i ? [] : segmentBoxes(o.points)))
    pe.labelBox = placeLabel(pe.points, w, { boxes: [...leaves, ...groupTitles, ...placedLabels], lines })
    placedLabels.push(pe.labelBox)
  })
  return { nodes, edges: placedEdges, lanes, width, height }
}

function laneMember(nodes: PlacedNode[], lane: Lane, id: string): string {
  return nodes.find((n) => n.id === id)?.lane === lane.name ? id : ''
}

function manhattan(byId: Map<string, PlacedNode>, e: MapEdge): number {
  const a = byId.get(e.from)!
  const b = byId.get(e.to)!
  return Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) + Math.abs(a.y + a.h / 2 - (b.y + b.h / 2))
}

function straight(from: Box, to: Box): Point[] {
  return [[from.x + from.w / 2, from.y + from.h], [to.x + to.w / 2, to.y]]
}
