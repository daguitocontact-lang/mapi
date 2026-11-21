import type { EdgeKind, NodeShape, NodeStyle } from '../model'

export const FONT_SIZE = 14
export const EDGE_LABEL_SIZE = FONT_SIZE - 2
export const GROUP_LABEL_SIZE = FONT_SIZE - 1
export const BAND_LABEL_X_FROM_RIGHT = 200
export const STEP_BADGE = 22
/** Icon drawn left of a group's title (`[icon=…]` on a group). */
export const GROUP_ICON = 22
/** Reference chips (copies of a shared box) are small one-line pills. */
export const CHIP_FONT = FONT_SIZE - 3
export const CHIP_LOGO = 16
export const CHIP_PAD_X = 10
export const CHIP_PAD_Y = 6
export const CHIP_LOGO_GAP = 6

export type Box = { x: number; y: number; w: number; h: number }

export type PlacedNode = Box & {
  id: string
  label: string
  style: NodeStyle
  shape: NodeShape
  isGroup: boolean
  /** Clickable to drill in — any group, collapsed or open. */
  drillable: boolean
  /** A collapsed group drawn as a single box. */
  stacked: boolean
  /** Opens another map. */
  link: string | null
  /** Brand logo name, drawn left of the label. */
  icon: string | null
  lane: string | null
  layer: string | null
  /** Copy of a `[clone]` box: the id it repeats, and in how many places it appears. */
  cloneOf: string | null
  copies: number
  attachedTo: string | null
  color: string | null
  badge: string | null
}

export type PlacedEdge = {
  from: string
  to: string
  points: Array<[number, number]>
  label: string | null
  /** Space the layout reserved for the label — drawing there can't overlap anything. */
  labelBox: Box | null
  kind: EdgeKind
  /** Story step ("3", "2a"), drawn as a badge inside the reserved label box. */
  step: string | null
  /** Enters/leaves this level from the outer story (drawn with an outlined badge). */
  outer: boolean
}

/** A dashed frame around boxes that share a lane, possibly spanning several layers. */
export type Lane = { name: string; box: Box }

export type LayerBand = {
  name: string
  top: number
  bottom: number
  /** Where the dashed divider below this band is drawn — chosen clear of labels (null = none). */
  dividerY: number | null
}

export const OVERLAP_KINDS = [
  'box-box',
  'line-through-box',
  'line-on-line',
  'label-collision',
  'outside-group',
] as const
export type OverlapKind = (typeof OVERLAP_KINDS)[number]

export type Overlap = { kind: OverlapKind; a: string; b: string }

export type Placed = {
  title: string | null
  width: number
  height: number
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  bands: LayerBand[]
  lanes: Lane[]
  /** Hard-rule violations left after every candidate layout was tried (ideally empty). */
  overlaps: Overlap[]
  crossings: number
}
