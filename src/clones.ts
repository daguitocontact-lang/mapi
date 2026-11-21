import type { MapDocument, MapEdge, MapNode } from './model'

/** Copies are `<id>~<n>`; the viewer strips the suffix to find every copy of a box. */
export const CLONE_SEPARATOR = '~'

/**
 * A `[clone]` box (Redis, the database…) used by many boxes is drawn once per user as a
 * reference chip attached under it — "this service uses Redis for queues" — instead of one
 * far box with a line from everyone (those lines cross no matter how the map is arranged).
 * The line itself disappears; its label stays on the map's links for the side panel.
 */
export function expandClones(doc: MapDocument): MapDocument {
  const cloned = new Map(doc.nodes.filter((n) => n.clone).map((n) => [n.id, n]))
  if (cloned.size === 0) return doc
  const copies: MapNode[] = []
  const count = new Map<string, number>()
  const edges: MapEdge[] = doc.edges.filter((e) => {
    const end = cloned.has(e.to) ? 'to' : cloned.has(e.from) ? 'from' : null
    if (!end) return true
    const original = cloned.get(e[end])!
    const owner = end === 'to' ? e.from : e.to
    const n = (count.get(original.id) ?? 0) + 1
    count.set(original.id, n)
    const name = original.label.split('\n')[0]!
    copies.push({
      ...original,
      id: `${original.id}${CLONE_SEPARATOR}${n}`,
      // Just the name: the reason ("colas y contadores") shows in the side panel on click,
      // so the chips stay short and the services remain what the eye sees first.
      label: name,
      clone: false,
      cloneOf: original.id,
      attachedTo: owner,
      col: null,
      layer: doc.nodes.find((x) => x.id === owner)?.layer ?? original.layer,
      children: [],
    })
    return false
  })
  for (const c of copies) c.copies = count.get(c.cloneOf!)!
  // Same order under every box (stores first, then services, each as declared), so two
  // services can be compared at a glance: same chip, same place.
  const declared = (id: string) => doc.nodes.findIndex((n) => n.id === id)
  const rank = (c: MapNode) => (c.shape === 'store' ? 0 : 1) * 1000 + declared(c.cloneOf!)
  copies.sort((a, b) => rank(a) - rank(b))
  const nodes = doc.nodes.filter((n) => !(n.clone && count.has(n.id)))
  return { ...doc, nodes: [...nodes, ...copies], edges }
}
