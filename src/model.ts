import type { ChartSpec } from './chart'

export const NODE_STYLES = ['solid', 'dashed', 'text', 'note'] as const
export type NodeStyle = (typeof NODE_STYLES)[number]

/** What a box IS — every shape always means the same thing, so maps read alike. */
export const NODE_SHAPES = ['step', 'actor', 'store', 'external', 'decision', 'icon'] as const
export type NodeShape = (typeof NODE_SHAPES)[number]

export const EDGE_KINDS = ['forward', 'both', 'dashed'] as const
export type EdgeKind = (typeof EDGE_KINDS)[number]

export type MapNode = {
  id: string
  label: string
  style: NodeStyle
  shape: NodeShape
  layer: string | null
  /** Drawn as a single stacked box; click to drill into its children. */
  collapsed: boolean
  /** Always shown, even in the essentials view (e.g. a failure outcome). */
  always: boolean
  /** Left-to-right slot inside its layer (architecture columns). */
  col: number | null
  /** Named lane: a dashed frame drawn around every box sharing it, across layers. */
  lane: string | null
  /** Brand logo drawn in the box (Iconify "logos" name, e.g. `aws-lambda`). */
  icon: string | null
  /** Where this box lives in the code — `path:line`, relative to the repo root. */
  code: string | null
  /** Another map this box opens ("another world") — `[map=name]`, without `.mapi`. */
  link: string | null
  /** `[clone]`: drawn again next to each box that uses it, instead of one far box with many lines. */
  clone: boolean
  /** Set on those copies: the id of the box they repeat (selecting one lights them all). */
  cloneOf: string | null
  /** How many places a cloned box appears in (0 when it isn't cloned). */
  copies: number
  /** A copy is attached under the box that uses it — no line needed. */
  attachedTo: string | null
  /** `[top]` = first row (entries), `[bottom]` = last row (asides); set per map by its author. */
  pin: 'top' | 'bottom' | null
  /** `[row=name]`: every box sharing the name sits at the same height. */
  row: string | null
  /** `[at=B3]` / `[at=2.5/3]` / `[at=A1:D8]`: exact ruler cell(s) — the box is placed there, not laid out. */
  at: string | null
  /** `[color=purple]`: frame/outline colour from a short named palette (cloud-diagram style). */
  color: string | null
  /** `[badge=4]`: a numbered marker in the box's corner (reference-diagram style). */
  badge: string | null
  /** `[chart=bar]` + a `data` line: the box draws a chart instead of a label. */
  chart?: ChartSpec
  /** Has a `doc`: the box makes room for the document mark. Set by the render pipeline. */
  doc?: boolean
  children: MapNode[]
}

export type MapEdge = {
  from: string
  to: string
  label: string | null
  kind: EdgeKind
  /** Story order ("1 a -> b"); a letter marks alternatives of one step ("2a", "2b").
   *  Unnumbered edges are context, drawn muted. */
  step: string | null
  /** Group the edge was written in (null = top level); steps are numbered per scope. */
  scope: string | null
  /** In a drill-in view: an edge from the OUTER story that enters/leaves this level.
   *  It keeps its outer step number but isn't part of this level's own story. */
  outer?: boolean
}

/** `flow` tells a numbered story; `architecture` shows every component (no essentials filter,
 *  no step requirement, technical names expected on boxes). */
export const MAP_KINDS = ['flow', 'architecture'] as const
export type MapKind = (typeof MAP_KINDS)[number]

export type MapDocument = {
  kind: MapKind
  title: string | null
  /** The one-line central idea — what someone coming back cold must grasp first. */
  summary: string | null
  /** Plain-language "what is this piece and what is it for", per node id (`about <id> <text>`). */
  about: Record<string, string>
  /** Longer text kept in its own file, per node id (`doc <id> <file>[#section]`). */
  docs: Record<string, DocRef>
  /** Chart numbers per box id (`data <id> …`, `series <id> …`); joined to the boxes after parsing. */
  charts: Record<string, { data?: string; series?: string; line: number }>
  layers: string[]
  nodes: MapNode[]
  edges: MapEdge[]
}

/** Where a box's long text lives: a file next to the map and, optionally, one section of it. */
export type DocRef = { path: string; section: string | null }

/** `prompt/system.txt#FRAUD RULE` → the file and, optionally, the section inside it. */
export function parseDocRef(raw: string): DocRef {
  const hash = raw.indexOf('#')
  if (hash < 0) return { path: raw.trim(), section: null }
  return { path: raw.slice(0, hash).trim(), section: raw.slice(hash + 1).trim() || null }
}

export const ISSUE_LEVELS = ['error', 'warning'] as const
export type IssueLevel = (typeof ISSUE_LEVELS)[number]

export type ParseError = { line: number; message: string; level?: IssueLevel }

const STEP_RE = /^(\d+)(?:\.(\d+))?([a-z]?)$/

/** Natural story order: 1 < 1a < 1b < 2 < 2.1 < 2.2 < 3 < 10. */
export function compareSteps(a: string, b: string): number {
  const [, an, as = '0', al = ''] = a.match(STEP_RE) ?? [, a]
  const [, bn, bs = '0', bl = ''] = b.match(STEP_RE) ?? [, b]
  return Number(an) - Number(bn) || Number(as) - Number(bs) || al.localeCompare(bl)
}

/** "3.2" — context that happens during step 3: drawn muted, shown only with context on. */
export function isSubStep(step: string | null): boolean {
  return step !== null && step.includes('.')
}
