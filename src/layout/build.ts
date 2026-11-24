import type { ElkNode, ElkExtendedEdge, ElkLabel } from 'elkjs/lib/elk-api.js'
import type { MapDocument, MapEdge, MapNode, NodeShape } from '../model'
import { textWidth } from '../measure'
import type { LayerBand, PlacedEdge, PlacedNode } from './types'
import { CHIP_FONT, CHIP_LOGO, CHIP_LOGO_GAP, CHIP_PAD_X, CHIP_PAD_Y, EDGE_LABEL_SIZE, FONT_SIZE, GROUP_LABEL_SIZE, STEP_BADGE } from './types'

const LINE_HEIGHT = 1.35
const PAD_X = 18
const PAD_Y = 12
const GROUP_LABEL_SPACE = 46
const LINK_ICON_SPACE = 18
const LABEL_PAD = 8
const COLUMN_SEED = 1000
/** Logo plate (22px) + gap, reserved beside the label. Must match the renderer. */
export const LOGO_SPACE = 35
/** Must match the renderer's card-stack offset. */
const STACK_ROOM = 6
export const ID_SIZE = 10

// Extra room each shape needs so its text stays inside the drawn outline
// (cylinder caps, pill ends, cloud bumps).
const SHAPE_PADDING: Record<NodeShape, { x: number; y: number }> = {
  step: { x: 0, y: 0 },
  actor: { x: 16, y: 0 },
  store: { x: 0, y: 0 },
  external: { x: 8, y: 6 },
  // A diamond's text area is half its box — give it room on every side.
  decision: { x: 64, y: 40 },
  icon: { x: 0, y: 0 },
}

/** Size of the logo in an `icon`-shaped box (logo above, name below). */
export const ICON_TILE = 48

/** One way of asking ELK to lay the map out; several are tried and scored. */
export type Candidate = { name: string; options: Record<string, string> }

export type BuildInput = {
  doc: MapDocument
  edges: MapEdge[]
  candidate: Candidate
  /** Multiplies every spacing — raised when a layout still has overlaps. */
  spread: number
  /** Kept for the call site; ids are drawn as tags on the border and never move boxes. */
  showIds: boolean
  /** Collapsed boxes drawn as a card stack — they need room for the back card. */
  stacked: Set<string>
}

function textBox(text: string, size: number): { width: number; height: number } {
  const lines = text.split('\n')
  const width = Math.max(...lines.map((l) => textWidth(l, size)))
  return { width, height: lines.length * size * LINE_HEIGHT }
}

const PORT_SIDES = ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const
type PortSide = (typeof PORT_SIDES)[number]

/** Port id for one vertex of a decision diamond. */
export function portId(nodeId: string, side: PortSide): string {
  return `${nodeId}::${side}`
}

/**
 * Decisions route through their diamond's points: in at the top, the story ("yes")
 * out the bottom, every other branch out a side — never from the box corners.
 */
function decisionPorts(edges: MapEdge[], decisions: Set<string>): Map<number, { source?: string; target?: string }> {
  const out = new Map<number, { source?: string; target?: string }>()
  const sideUse = new Map<string, number>()
  const southTaken = new Set<string>()
  edges.forEach((e, i) => {
    const entry: { source?: string; target?: string } = {}
    if (decisions.has(e.to)) entry.target = portId(e.to, 'NORTH')
    if (decisions.has(e.from)) {
      // The first story branch written continues straight down; any other branch
      // (a second numbered alternative, or an unnumbered one) leaves by a side.
      if (e.step !== null && !southTaken.has(e.from)) {
        southTaken.add(e.from)
        entry.source = portId(e.from, 'SOUTH')
      } else {
        const n = sideUse.get(e.from) ?? 0
        sideUse.set(e.from, n + 1)
        entry.source = portId(e.from, n % 2 === 0 ? 'EAST' : 'WEST')
      }
    }
    if (entry.source || entry.target) out.set(i, entry)
  })
  return out
}

function toElk(node: MapNode, input: BuildInput): ElkNode {
  const partition = node.layer ? input.doc.layers.indexOf(node.layer) : -1
  const layoutOptions: Record<string, string> = {}
  if (partition >= 0) layoutOptions['elk.partitioning.partition'] = String(partition)
  // `col=N` pins the left-to-right slot inside its layer (architecture columns).
  if (node.col !== null) layoutOptions['elk.layered.crossingMinimization.positionChoiceConstraint'] = String(node.col)
  // Semi-interactive ordering reads the INITIAL x of each node: seed it from the column.
  const seed = node.col !== null ? { x: node.col * COLUMN_SEED, y: 0 } : {}
  if (node.children.length === 0 && node.attachedTo) {
    const t = textBox(node.label, CHIP_FONT)
    const room = input.stacked.has(node.id) || input.stacked.has(node.cloneOf ?? '') ? STACK_ROOM : 0
    return {
      id: node.id,
      ...seed,
      width: t.width + CHIP_PAD_X * 2 + (node.icon ? CHIP_LOGO + CHIP_LOGO_GAP : 0) + (node.link ? LINK_ICON_SPACE : 0) + room,
      height: t.height + CHIP_PAD_Y * 2 + room,
      layoutOptions,
    }
  }
  if (node.children.length === 0 && node.shape === 'icon') {
    const t = textBox(node.label, FONT_SIZE)
    return { id: node.id, ...seed, width: Math.max(t.width, ICON_TILE) + 16, height: ICON_TILE + 10 + t.height + 8, layoutOptions }
  }
  if (node.children.length === 0) {
    const t = textBox(node.label, FONT_SIZE)
    const extra = SHAPE_PADDING[node.shape]
    const stackRoom = input.stacked.has(node.id) ? STACK_ROOM : 0
    const ports =
      node.shape === 'decision'
        ? {
            ports: PORT_SIDES.map((side) => ({
              id: portId(node.id, side),
              width: 0,
              height: 0,
              layoutOptions: { 'elk.port.side': side },
            })),
          }
        : {}
    const portOptions: Record<string, string> =
      node.shape === 'decision'
        ? { 'elk.portConstraints': 'FIXED_SIDE', 'elk.portAlignment.default': 'CENTER' }
        : {}
    return {
      id: node.id,
      ...seed,
      ...ports,
      width: t.width + PAD_X * 2 + extra.x + (node.link ? LINK_ICON_SPACE : 0) + stackRoom + (node.icon ? LOGO_SPACE : 0),
      height: t.height + PAD_Y * 2 + extra.y + stackRoom,
      layoutOptions: { ...layoutOptions, ...portOptions },
    }
  }
  // A group must be at least as wide as its own title, or the title spills out.
  const title = textBox(node.label, GROUP_LABEL_SIZE)
  return {
    id: node.id,
    ...seed,
    layoutOptions: {
      ...layoutOptions,
      'elk.padding': `[top=${GROUP_LABEL_SPACE + title.height - GROUP_LABEL_SIZE},left=24,bottom=24,right=24]`,
      'elk.nodeSize.constraints': 'MINIMUM_SIZE',
      'elk.nodeSize.minimum': `(${title.width + 40 + (node.icon ? 28 : 0)}, ${title.height + 40})`,
    },
    children: node.children.map((c) => toElk(c, input)),
  }
}

function spacing(spread: number, compact: boolean): Record<string, string> {
  // Architecture maps are dense structure (few labels): tighter rows read better.
  const s = (v: number) => String(Math.round(v * spread * (compact ? 0.7 : 1)))
  return {
    'elk.layered.spacing.nodeNodeBetweenLayers': s(70),
    'elk.spacing.nodeNode': s(60),
    'elk.spacing.edgeNode': s(28),
    'elk.spacing.edgeEdge': s(18),
    'elk.layered.spacing.edgeNodeBetweenLayers': s(28),
    'elk.layered.spacing.edgeEdgeBetweenLayers': s(18),
    'elk.spacing.edgeLabel': s(12),
  }
}

/** Reserve room for the step badge and the label text side by side. */
function edgeLabel(e: MapEdge, i: number): ElkLabel {
  const text = e.label ? textBox(e.label, EDGE_LABEL_SIZE) : { width: 0, height: 0 }
  // Wider pill per extra character ("2a", and "↑5" for outer-story steps).
  const shown = e.step === null ? '' : e.outer ? `↑${e.step}` : e.step
  const badgeW = STEP_BADGE + Math.max(0, shown.length - 1) * 8
  const badge = e.step !== null ? badgeW + (e.label ? 6 : 0) : 0
  // Context edges (no step) carry their label ON the line, so it can never be read
  // as belonging to a neighbouring thin line; story labels sit beside their badge.
  const inline = e.step === null
  return {
    id: `e${i}.label`,
    text: e.label ?? e.step ?? '',
    layoutOptions: inline ? { 'elk.edgeLabels.inline': 'true' } : {},
    // Breathing room so the text never touches its own line.
    width: text.width + badge + LABEL_PAD,
    height: Math.max(text.height, e.step !== null ? STEP_BADGE : 0),
  }
}

function linkedIds(edges: MapEdge[]): Set<string> {
  return new Set(edges.flatMap((e) => [e.from, e.to]))
}

function hasColumns(nodes: MapNode[]): boolean {
  return nodes.some((n) => n.col !== null || hasColumns(n.children))
}

function collectDecisions(nodes: MapNode[], into: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.shape === 'decision' && n.children.length === 0) into.add(n.id)
    collectDecisions(n.children, into)
  }
  return into
}

const GRID_MIN = 5

/**
 * A group of many unconnected boxes would lay out as one endless row. Hidden "stacking"
 * edges (box i → box i+half) fold it into two rows. They're layout-only: never drawn,
 * never inspected (ids start with `h`).
 */
function stackingEdges(nodes: MapNode[], linked: Set<string>): ElkExtendedEdge[] {
  return nodes.flatMap((n) => {
    const leaves = n.children.filter((c) => c.children.length === 0 && !linked.has(c.id))
    const own = n.children.length >= GRID_MIN && leaves.length === n.children.length
    const half = Math.ceil(leaves.length / 2)
    const here: ElkExtendedEdge[] = own
      ? leaves.slice(0, leaves.length - half).map((c, i) => ({
          id: `h${c.id}`,
          sources: [c.id],
          targets: [leaves[i + half]!.id],
        }))
      : []
    return [...here, ...stackingEdges(n.children, linked)]
  })
}

export function buildGraph(input: BuildInput): ElkNode {
  const ports = decisionPorts(input.edges, collectDecisions(input.doc.nodes, new Set()))
  const edges: ElkExtendedEdge[] = input.edges.map((e, i) => {
    const labels: ElkLabel[] = e.label || e.step !== null ? [edgeLabel(e, i)] : []
    // The numbered story must read top → down: give its edges direction priority.
    const layoutOptions: Record<string, string> =
      e.step !== null ? { 'elk.layered.priority.direction': '10' } : {}
    const port = ports.get(i)
    return {
      id: `e${i}`,
      sources: [port?.source ?? e.from],
      targets: [port?.target ?? e.to],
      labels,
      layoutOptions,
    }
  })
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.partitioning.activate': 'true',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.thoroughness': '40',
      'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
      'elk.padding': '[top=110,left=60,bottom=60,right=260]',
      ...spacing(input.spread, input.doc.kind === 'architecture'),
      ...input.candidate.options,
      // `col=` position constraints are only honoured in semi-interactive crossing minimization.
      // Columns need every entry on the SAME top row (longest-path layering puts all sources
      // first) — otherwise each box sits alone in its row and "column" means nothing.
      ...(hasColumns(input.doc.nodes)
        ? {
            'elk.layered.crossingMinimization.semiInteractive': 'true',
            'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
          }
        : {}),
    },
    children: input.doc.nodes.map((n) => toElk(n, input)),
    edges: [...edges, ...stackingEdges(input.doc.nodes, linkedIds(input.edges))],
  }
}

function index(nodes: MapNode[], into: Map<string, MapNode>): Map<string, MapNode> {
  for (const n of nodes) {
    into.set(n.id, n)
    index(n.children, into)
  }
  return into
}

export function indexNodes(nodes: MapNode[]): Map<string, MapNode> {
  return index(nodes, new Map())
}

type ReadContext = { source: Map<string, MapNode>; drillable: Set<string> }

export function readNodes(elk: ElkNode, ctx: ReadContext, dx = 0, dy = 0): PlacedNode[] {
  return (elk.children ?? []).flatMap((child) => {
    const x = dx + (child.x ?? 0)
    const y = dy + (child.y ?? 0)
    const original = ctx.source.get(child.id)!
    const isGroup = original.children.length > 0
    // A chip copy of a collapsed box opens the original's detail.
    const drillable = ctx.drillable.has(child.id) || (original.cloneOf !== null && ctx.drillable.has(original.cloneOf))
    const placed: PlacedNode = {
      id: child.id,
      label: original.label,
      style: original.style,
      shape: original.shape,
      isGroup,
      drillable,
      stacked: drillable && !isGroup,
      link: original.link,
      icon: original.icon,
      lane: original.lane,
      layer: original.layer,
      cloneOf: original.cloneOf,
      copies: original.copies,
      attachedTo: original.attachedTo,
      color: original.color,
      badge: original.badge,
      x,
      y,
      w: child.width ?? 0,
      h: child.height ?? 0,
    }
    return [placed, ...readNodes(child, ctx, x, y)]
  })
}

export function readEdges(elk: ElkNode, edges: MapEdge[], nodes: PlacedNode[]): PlacedEdge[] {
  const origin = new Map(nodes.map((n) => [n.id, [n.x, n.y] as const]))
  // Only real edges (e0, e1…) — hidden stacking edges (h…) are layout-only.
  return (elk.edges ?? []).filter((edge) => edge.id.startsWith('e')).map((edge, i) => {
    // ELK reports an edge relative to its container — the deepest group holding both ends.
    const [ox, oy] = origin.get(edge.container ?? 'root') ?? [0, 0]
    const section = edge.sections?.[0]
    const points: Array<[number, number]> = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => [p.x + ox, p.y + oy])
      : []
    const label = edge.labels?.[0]
    const source = edges[i]!
    return {
      from: source.from,
      to: source.to,
      points,
      label: source.label,
      labelBox: label
        ? { x: (label.x ?? 0) + ox, y: (label.y ?? 0) + oy, w: label.width ?? 0, h: label.height ?? 0 }
        : null,
      kind: source.kind,
      step: source.step,
      outer: source.outer ?? false,
    }
  })
}

function spansOneLayer(node: MapNode): boolean {
  const layers = new Set<string | null>()
  const walk = (n: MapNode): void => {
    layers.add(n.layer)
    n.children.forEach(walk)
  }
  walk(node)
  return layers.size === 1
}

/** Bands come from TOP-LEVEL shapes only: a group that spans several layers (e.g. a
 *  vertical "Custom Softwares" column) would otherwise smear every band into one. */
export function computeBands(doc: MapDocument, nodes: PlacedNode[]): LayerBand[] {
  const banded = new Set(doc.nodes.filter(spansOneLayer).map((n) => n.id))
  return doc.layers.flatMap((name) => {
    const members = nodes.filter((n) => n.layer === name && banded.has(n.id))
    if (members.length === 0) return []
    const top = Math.min(...members.map((n) => n.y))
    const bottom = Math.max(...members.map((n) => n.y + n.h))
    return [{ name, top, bottom, dividerY: null }]
  })
}
