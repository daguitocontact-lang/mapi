import type { MapDocument, MapEdge, MapNode } from './model'
import { isSubStep } from './model'

export type Crumb = { id: string | null; label: string }

export type MapView = {
  doc: MapDocument
  /** Ids the viewer can click to drill into (groups, collapsed or not). */
  drillable: Set<string>
  trail: Crumb[]
}

const GHOST_PREFIX = 'ghost.'

function findPath(nodes: MapNode[], id: string, path: MapNode[] = []): MapNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...path, n]
    const found = findPath(n.children, id, [...path, n])
    if (found) return found
  }
  return null
}

function isInside(id: string, groupId: string): boolean {
  return id.startsWith(`${groupId}.`)
}

function topLevelOwner(nodes: MapNode[], id: string): MapNode | null {
  return nodes.find((n) => n.id === id || isInside(id, n.id)) ?? null
}

/** Collapsed groups become leaves; edges into their insides attach to the group itself. */
function collapse(nodes: MapNode[], edges: MapEdge[]): { nodes: MapNode[]; edges: MapEdge[] } {
  const collapsedIds: string[] = []
  const strip = (list: MapNode[]): MapNode[] =>
    list.map((n) => {
      if (n.collapsed && n.children.length > 0) {
        collapsedIds.push(n.id)
        return { ...n, children: [] }
      }
      return { ...n, children: strip(n.children) }
    })
  const stripped = strip(nodes)
  const remap = (id: string) => collapsedIds.find((g) => isInside(id, g)) ?? id
  const seen = new Set<string>()
  const remapped = edges
    .map((e) => ({ ...e, from: remap(e.from), to: remap(e.to) }))
    .filter((e) => {
      const key = `${e.from}>${e.to}`
      if (e.from === e.to || seen.has(key)) return false
      seen.add(key)
      return true
    })
  return { nodes: stripped, edges: remapped }
}

function collectDrillable(nodes: MapNode[], into: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.children.length > 0) into.add(n.id)
    collectDrillable(n.children, into)
  }
  return into
}

/** Edges touching the focused group from outside reach its entry/exit children. */
type FocusScope = { focus: MapNode; siblings: MapNode[]; ghosts: Map<string, MapNode> }

/** The box representing `id` one level up: the focus's sibling that holds it, else the top-level owner. */
function neighbourOf(doc: MapDocument, siblings: MapNode[], id: string): MapNode | null {
  return topLevelOwner(siblings, id) ?? topLevelOwner(doc.nodes, id)
}

/** Edges touching the focused group from outside reach its entry/exit children. */
function focusEdges(doc: MapDocument, { focus, siblings, ghosts }: FocusScope): MapEdge[] {
  const inside = (id: string) => isInside(id, focus.id)
  const internal = doc.edges.filter((e) => inside(e.from) && inside(e.to))
  // Notes and fallbacks are never where the flow enters or leaves a group.
  const steps = focus.children.filter((c) => c.style === 'solid').map((c) => c.id)
  const entries = steps.filter((id) => !internal.some((e) => e.to === id))
  const exits = steps.filter((id) => !internal.some((e) => e.from === id))
  const ghostFor = (id: string): string => {
    const owner = neighbourOf(doc, siblings, id)
    const ghostId = `${GHOST_PREFIX}${(owner ?? { id }).id}`
    if (!ghosts.has(ghostId)) {
      ghosts.set(ghostId, {
        id: ghostId,
        label: owner?.label ?? id,
        style: 'dashed',
        shape: owner?.shape ?? 'step',
        layer: owner?.layer ?? null,
        collapsed: false,
        always: owner?.always ?? false,
        link: owner?.link ?? null,
        code: owner?.code ?? null,
        icon: owner?.icon ?? null,
        col: null,
        lane: null,
        clone: false,
        cloneOf: null,
        copies: 0,
        attachedTo: null,
        pin: null,
        row: null,
        at: null,
        color: null,
        badge: null,
        children: [],
      })
    }
    return ghostId
  }
  const crossing = doc.edges.flatMap((e): MapEdge[] => {
    const fromIn = inside(e.from) || e.from === focus.id
    const toIn = inside(e.to) || e.to === focus.id
    if (fromIn === toIn) return []
    if (toIn) {
      const targets = e.to === focus.id ? entries : [e.to]
      return targets.map((to) => ({ ...e, from: ghostFor(e.from), to }))
    }
    const sources = e.from === focus.id ? exits : [e.from]
    return sources.map((from) => ({ ...e, from, to: ghostFor(e.to) }))
  })
  return [...internal, ...crossing]
}

/** Only the story of the scope on screen is numbered; everything else is context. */
function numberScope(edges: MapEdge[], scope: string | null): MapEdge[] {
  return edges.map((e) => (e.scope === scope ? e : { ...e, step: null }))
}

function pruneNodes(nodes: MapNode[], keep: Set<string>): MapNode[] {
  return nodes.flatMap((n) => {
    const children = pruneNodes(n.children, keep)
    // Notes (`[text]`) explain the WHY — they always survive the essentials filter.
    if (!keep.has(n.id) && n.style !== 'text' && children.length === 0) return []
    return [{ ...n, children: n.children.length > 0 && children.length === 0 ? n.children : children }]
  })
}

/**
 * Essentials only: the numbered story plus where it enters/leaves this scope.
 * Context (stores, fallbacks, side calls) is hidden until the reader asks for it.
 * A scope with no numbered story is shown whole — there is nothing to filter by.
 */
function essentials(view: { nodes: MapNode[]; edges: MapEdge[] }, storyGhosts: Set<string>) {
  const isStory = (e: MapEdge) => e.step !== null && !isSubStep(e.step)
  if (!view.edges.some(isStory)) return view
  const always = new Set<string>()
  const markAlways = (list: MapNode[]): void =>
    list.forEach((n) => {
      if (n.always) always.add(n.id)
      markAlways(n.children)
    })
  markAlways(view.nodes)
  const touchesAlways = (id: string) =>
    [...always].some((a) => id === a || id === `${GHOST_PREFIX}${a}` || id.endsWith(`.${a}`))
  const edges = view.edges.filter(
    (e) =>
      isStory(e) ||
      storyGhosts.has(e.from) ||
      storyGhosts.has(e.to) ||
      touchesAlways(e.from) ||
      touchesAlways(e.to),
  )
  const keep = new Set(edges.flatMap((e) => [e.from, e.to]))
  return { nodes: pruneNodes(view.nodes, keep), edges }
}

/** Ghosts worth keeping in essentials: the outer story steps this scope plugs into. */
function outerStoryGhosts(doc: MapDocument, parentScope: string | null, siblings: MapNode[]): Set<string> {
  const ids = doc.edges
    .filter((e) => e.step !== null && !isSubStep(e.step) && e.scope === parentScope)
    .flatMap((e) => [e.from, e.to])
    .map((id) => `${GHOST_PREFIX}${(neighbourOf(doc, siblings, id) ?? { id }).id}`)
  return new Set(ids)
}

export type ViewOptions = { focusId: string | null; context: boolean }

export function viewDocument(doc: MapDocument, { focusId, context }: ViewOptions): MapView {
  const rootCrumb: Crumb = { id: null, label: doc.title ?? 'Map' }
  const path = focusId ? findPath(doc.nodes, focusId) : null
  const focus = path?.[path.length - 1]
  if (!focus || focus.children.length === 0) {
    const all = collapse(doc.nodes, numberScope(doc.edges, null))
    const collapsed = context || doc.kind === 'architecture' ? all : essentials(all, new Set())
    return {
      doc: { ...doc, ...collapsed },
      drillable: collectDrillable(doc.nodes, new Set()),
      trail: [rootCrumb],
    }
  }
  const ghosts = new Map<string, MapNode>()
  const parent = path!.length > 1 ? path![path!.length - 2]! : null
  const siblings = parent ? parent.children : doc.nodes
  const parentScope = parent?.id ?? null
  const edges = focusEdges(doc, { focus, siblings, ghosts }).map((e): MapEdge => {
    const crossing = e.from.startsWith(GHOST_PREFIX) || e.to.startsWith(GHOST_PREFIX)
    if (!crossing) return e.scope === focus.id ? e : { ...e, step: null }
    // How the outer story enters/leaves this level: keep its number, flag it as outer.
    return e.scope === parentScope && e.step !== null ? { ...e, outer: true } : { ...e, step: null }
  })
  const all = collapse([...focus.children, ...ghosts.values()], edges)
  const collapsed =
    context || doc.kind === 'architecture' ? all : essentials(all, outerStoryGhosts(doc, parentScope, siblings))
  return {
    doc: { ...doc, title: focus.label.replace(/\n/g, ' '), ...collapsed },
    drillable: collectDrillable(focus.children, new Set()),
    trail: [rootCrumb, ...path!.map((n) => ({ id: n.id, label: n.label.replace(/\n/g, ' ') }))],
  }
}
