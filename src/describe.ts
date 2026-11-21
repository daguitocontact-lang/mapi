import type { Placed, PlacedEdge, PlacedNode } from './layout'

/** Same cell size as the viewer rulers, so "C4" means the same spot in text and on screen. */
export const CELL = 200
/** Lines longer than this many cells are called out — usually a sign something sits too far away. */
const LONG_EDGE_CELLS = 5

function oneLine(label: string): string {
  return label.split('\n')[0]!
}

function columnName(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : columnName(Math.floor(i / 26) - 1) + columnName(i % 26)
}

function cellOf(x: number, y: number): string {
  return `${columnName(Math.floor(x / CELL))}${Math.floor(y / CELL) + 1}`
}

/** "C4" for a box inside one cell, "C4–E5" when it spans several. */
function spanOf(n: PlacedNode): string {
  const a = cellOf(n.x, n.y)
  const b = cellOf(n.x + n.w - 1, n.y + n.h - 1)
  return a === b ? a : `${a}–${b}`
}

function lengthOf(e: PlacedEdge): number {
  let total = 0
  for (let i = 1; i < e.points.length; i++) {
    const [x0, y0] = e.points[i - 1]!
    const [x1, y1] = e.points[i]!
    total += Math.abs(x1 - x0) + Math.abs(y1 - y0)
  }
  return total
}

const ARROWS = { right: '→', left: '←', down: '↓', up: '↑' } as const

/** The route as ruler cells: start, then every turn with the direction taken — "E4↓E6→H6". */
function routeOf(e: PlacedEdge): string {
  const pts = e.points
  if (pts.length === 0) return '(no route)'
  let out = cellOf(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!
    const [x1, y1] = pts[i]!
    const dir = x1 > x0 ? 'right' : x1 < x0 ? 'left' : y1 > y0 ? 'down' : 'up'
    out += ARROWS[dir] + cellOf(x1, y1)
  }
  return out
}

/**
 * Where everything landed after layout, as compact text — lets an AI reason about the
 * picture ("Correo sits at H1, its line to the balancer runs 9 cells") without the image.
 * Boxes per layer left → right with their ruler cells; then every line with its route as
 * cells ("E4↓E6→H6"), length, bends and label cell, longest first, flagging far ones.
 */
export function describePlacement(placed: Placed): string {
  const cols = Math.ceil(placed.width / CELL)
  const rows = Math.ceil(placed.height / CELL)
  const out = [`canvas ${columnName(0)}1–${columnName(cols - 1)}${rows} · ${placed.crossings} crossings`]
  const groups = placed.nodes.filter((n) => n.isGroup)
  const parentOf = (n: PlacedNode) => groups.find((g) => n.id.startsWith(`${g.id}.`))
  const layers = placed.bands.length > 0 ? placed.bands.map((b) => b.name) : [null]
  for (const layer of layers) {
    const members = placed.nodes
      .filter((n) => !parentOf(n) && (layer === null || n.layer === layer))
      .sort((a, b) => a.x - b.x || a.y - b.y)
    const cells = members.map((n) => {
      const kids = placed.nodes.filter((k) => parentOf(k)?.id === n.id).map((k) => k.id.split('.').pop())
      const inner = n.isGroup && kids.length > 0 ? ` {${kids.join(', ')}}` : ''
      return `${n.id} ${spanOf(n)}${inner}`
    })
    out.push(`${layer ?? 'map'}: ${cells.join(' · ')}`)
  }
  for (const lane of placed.lanes) {
    const b = lane.box
    out.push(`lane "${lane.name}": ${cellOf(b.x, b.y)}–${cellOf(b.x + b.w - 1, b.y + b.h - 1)}`)
  }
  const edges = placed.edges
    .map((e) => ({ e, cells: lengthOf(e) / CELL, bends: Math.max(0, e.points.length - 2) }))
    .sort((a, b) => b.cells - a.cells)
  out.push('lines (longest first):')
  for (const { e, cells, bends } of edges) {
    const flag = cells > LONG_EDGE_CELLS ? '  LONG' : ''
    const label = e.label ? ` "${oneLine(e.label)}"` : ''
    const at = e.labelBox ? ` · label at ${cellOf(e.labelBox.x, e.labelBox.y)}` : ''
    out.push(`  ${e.from} -> ${e.to}${label}: ${routeOf(e)} · ${cells.toFixed(1)} cells, ${bends} bends${at}${flag}`)
  }
  return out.join('\n')
}
