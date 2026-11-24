import type { EdgeKind, MapDocument, MapNode, NodeShape, NodeStyle, ParseError } from './model'
import { MAP_KINDS, NODE_SHAPES, NODE_STYLES, parseDocRef } from './model'
import type { MapKind } from './model'

const EDGE_RE = /^(?:(\d+(?:\.\d+)?[a-z]?)[)]?\s+)?(\^?[\w.-]+)\s*(<->|-->|->)\s*(\^?[\w.-]+)\s*(?::\s*(.+))?$/
// Only a TRAILING `{` opens a group — labels may contain braces ("{company}-panel").
const NODE_RE = /^([\w-]+)\s*:\s*(.*?)\s*(?:\[([^\]]*)\])?\s*(\{)?$/
const ARROWS: Record<string, EdgeKind> = { '->': 'forward', '<->': 'both', '-->': 'dashed' }

type Attrs = {
  style: NodeStyle | null
  shape: NodeShape
  layer: string | null
  collapsed: boolean
  always: boolean
  clone: boolean
  pin: 'top' | 'bottom' | null
  same: string | null
  row: string | null
  at: string | null
  color: string | null
  badge: string | null
  link: string | null
  code: string | null
  icon: string | null
  col: number | null
  lane: string | null
}

function parseAttrs(raw: string | undefined): Attrs {
  const attrs: Attrs = { style: null, shape: 'step', layer: null, collapsed: false, always: false, clone: false, pin: null, same: null, row: null, at: null, color: null, badge: null, link: null, code: null, icon: null, col: null, lane: null }
  for (const part of (raw ?? '').split(',').map((p) => p.trim())) {
    if (!part) continue
    if ((NODE_STYLES as readonly string[]).includes(part)) attrs.style = part as NodeStyle
    if (part === 'collapsed') attrs.collapsed = true
    if (part === 'always') attrs.always = true
    if (part === 'clone') attrs.clone = true
    if (part === 'top' || part === 'bottom') attrs.pin = part
    const same = part.match(/^same\s*=\s*([\w.-]+)$/)
    if (same) attrs.same = same[1]!
    const row = part.match(/^row\s*=\s*([\w.-]+)$/)
    if (row) attrs.row = row[1]!
    const at = part.match(/^at\s*=\s*([A-Z]+\d+(?::[A-Z]+\d+)?|[\d.]+\/[\d.]+(?::[\d.]+\/[\d.]+)?)$/)
    if (at) attrs.at = at[1]!
    const color = part.match(/^color\s*=\s*(purple|pink|orange|green|blue|gray|red)$/)
    if (color) attrs.color = color[1]!
    const badge = part.match(/^badge\s*=\s*([\w.]{1,3})$/)
    if (badge) attrs.badge = badge[1]!
    if ((NODE_SHAPES as readonly string[]).includes(part)) attrs.shape = part as NodeShape
    // Fractional columns (col=3.5, col=1.75) slot a box between two columns.
    const col = part.match(/^col\s*=\s*(\d+(?:\.\d+)?)$/)
    if (col) attrs.col = Number(col[1])
    const lane = part.match(/^lane\s*=\s*(.+)$/)
    if (lane) attrs.lane = lane[1]!.trim()
    // `aws-lambda` (logos) or `lucide:users` (set:name).
    const icon = part.match(/^icon\s*=\s*((?:[\w-]+:)?[\w-]+)$/)
    if (icon) attrs.icon = icon[1]!
    const code = part.match(/^code\s*=\s*([\w./-]+:\d+)$/)
    if (code) attrs.code = code[1]!
    const link = part.match(/^map\s*=\s*([\w-]+)$/)
    if (link) attrs.link = link[1]!
    const layer = part.match(/^layer\s*=\s*(.+)$/)
    if (layer) attrs.layer = layer[1]!.trim()
  }
  return attrs
}

/**
 * Parse `.mapi` source. One statement per line:
 *   kind flow|architecture · title <text> · summary <central idea> · layers A, B, C · layer <name>
 *   about <id> <text>                      (what a piece is, shown in the side panel)
 *   doc <id> <file>[#Section]              (its long text — a prompt, a spec — kept in its own file;
 *                                           click the box to read it)
 *   id: Label [dashed, layer=Data] { … }   (a `{` opens a group, `}` closes it)
 *   shapes: [actor] person · [store] data · [external] outside service · [decision] question
 *           with "yes"/"no" edges · default = step
 *   [note] sticky note on the canvas that shows an excerpt of its `doc`
 *   [always] keeps a box visible in the essentials view (e.g. a failure outcome)
 *   [clone] repeats a shared box next to each user (Redis, the database…) instead of long lines
 *   [top] / [bottom] pins a box to the first row (entries) or the last row (asides)
 *   [same=id] marks a box as the same real resource drawn twice (one load balancer, two routes)
 *   [row=name] boxes sharing the name sit at the same height
 *   [at=B3] / [at=2.5/3] / [at=A1:D8] places a box (or a group's area) exactly on the ruler grid
 *   [icon] shape = big logo over its name, no box (cloud-diagram style)
 *   [color=purple|pink|orange|green|blue|gray|red] outline colour · [badge=4] numbered corner marker
 *   [col=0] left-to-right column inside its layer · [lane=Name] dashed frame across layers
 *   [icon=aws-lambda] brand logo in the box (Iconify "logos" set)
 *   [code=path/file.ts:42] where the box lives in the code (opens the editor there)
 *   [map=other] links the box to another map (opens it, like a family-tree branch)
 *   a -> b: label · a <-> b · a --> b      (dashed)
 *   1 a -> b: label                        (step 1 of the story at this scope)
 *   2a a -> b · 2b c -> b                  (two alternative ways of doing step 2)
 *   3.1 redis -> a: busca                  (context that happens during step 3)
 * Inside a group, a bare id ("queue") is relative to it; a dotted id ("app.c") is absolute;
 * `^id` names a top-level box from inside any group.
 * A node inherits the layer active when it is declared unless it sets its own.
 */
export function parseMapi(source: string): { doc: MapDocument; errors: ParseError[] } {
  const doc: MapDocument = { kind: 'flow', title: null, summary: null, about: {}, docs: {}, layers: [], nodes: [], edges: [] }
  const errors: ParseError[] = []
  const stack: MapNode[] = []
  let currentLayer: string | null = null

  source.split('\n').forEach((rawLine, i) => {
    const line = rawLine.trim()
    const lineNo = i + 1
    if (!line || line.startsWith('#')) return

    if (line.startsWith('title ')) {
      doc.title = line.slice(6).trim()
      return
    }
    if (line.startsWith('kind ')) {
      const kind = line.slice(5).trim()
      if ((MAP_KINDS as readonly string[]).includes(kind)) doc.kind = kind as MapKind
      else errors.push({ line: lineNo, message: `unknown kind "${kind}" (flow | architecture)` })
      return
    }
    if (line.startsWith('about ')) {
      const m = line.match(/^about\s+([\w.-]+)\s+(.+)$/)
      if (m) doc.about[m[1]!] = m[2]!.trim()
      else errors.push({ line: lineNo, message: 'about needs "about <id> <description>"' })
      return
    }
    // `doc -> x` is a line from a box called "doc", not a doc reference.
    if (line.startsWith('doc ') && !EDGE_RE.test(line)) {
      const m = line.match(/^doc\s+([\w.-]+)\s+(\S.*)$/)
      if (m) doc.docs[m[1]!] = parseDocRef(m[2]!)
      else errors.push({ line: lineNo, message: 'doc needs "doc <id> <file>[#section]"' })
      return
    }
    if (line.startsWith('summary ')) {
      doc.summary = line.slice(8).trim()
      return
    }
    if (line.startsWith('layers ')) {
      doc.layers = line.slice(7).split(',').map((l) => l.trim()).filter(Boolean)
      return
    }
    if (line.startsWith('layer ')) {
      currentLayer = line.slice(6).trim()
      if (!doc.layers.includes(currentLayer)) {
        errors.push({ line: lineNo, message: `unknown layer "${currentLayer}"` })
      }
      return
    }
    if (line === '}') {
      if (!stack.pop()) errors.push({ line: lineNo, message: 'unmatched }' })
      return
    }

    const edge = line.match(EDGE_RE)
    if (edge) {
      const [, step, from, arrow, to, label] = edge
      const scope = stack[stack.length - 1]
      // `^id` = top level, dotted = absolute path, bare = relative to the enclosing group.
      const resolve = (id: string) =>
        id.startsWith('^') ? id.slice(1) : scope && !id.includes('.') ? `${scope.id}.${id}` : id
      doc.edges.push({
        from: resolve(from!),
        to: resolve(to!),
        kind: ARROWS[arrow!]!,
        label: label?.trim() || null,
        step: step ?? null,
        scope: scope?.id ?? null,
      })
      return
    }

    const node = line.match(NODE_RE)
    if (!node) {
      errors.push({ line: lineNo, message: `cannot parse "${line}"` })
      return
    }
    const [, id, label, rawAttrs, opensGroup] = node
    const attrs = parseAttrs(rawAttrs)
    const parent = stack[stack.length - 1]
    const created: MapNode = {
      id: parent ? `${parent.id}.${id}` : id!,
      label: (label || id!).replace(/\\n/g, '\n'),
      style: attrs.style ?? 'solid',
      shape: attrs.shape,
      layer: attrs.layer ?? currentLayer ?? parent?.layer ?? null,
      collapsed: attrs.collapsed,
      always: attrs.always,
      link: attrs.link,
      code: attrs.code,
      icon: attrs.icon,
      col: attrs.col,
      lane: attrs.lane,
      clone: attrs.clone,
      cloneOf: attrs.same,
      copies: 0,
      attachedTo: null,
      pin: attrs.pin,
      row: attrs.row,
      at: attrs.at,
      color: attrs.color,
      badge: attrs.badge,
      children: [],
    }
    ;(parent ? parent.children : doc.nodes).push(created)
    if (opensGroup) stack.push(created)
  })

  if (stack.length > 0) errors.push({ line: 0, message: `${stack.length} group(s) not closed` })
  errors.push(...findDanglingEdges(doc), ...findUnknownDocs(doc), ...checkReadability(doc))
  return { doc, errors }
}

function collectIds(nodes: MapNode[], into: Set<string>): Set<string> {
  for (const n of nodes) {
    into.add(n.id)
    collectIds(n.children, into)
  }
  return into
}

function findDanglingEdges(doc: MapDocument): ParseError[] {
  const ids = collectIds(doc.nodes, new Set())
  return doc.edges.flatMap((e) =>
    [e.from, e.to]
      .filter((id) => !ids.has(id))
      .map((id) => ({ line: 0, message: `edge references unknown node "${id}"` })),
  )
}

function findUnknownDocs(doc: MapDocument): ParseError[] {
  const ids = collectIds(doc.nodes, new Set())
  const short = new Set([...ids].map((id) => id.split('.').pop()!))
  return Object.keys(doc.docs)
    .filter((id) => !ids.has(id) && !short.has(id))
    .map((id) => ({ line: 0, message: `doc references unknown box "${id}"` }))
}

const CODE_TALK = /\.(ts|tsx|js|py|go)\b|\w+\(\)|\b[a-z]+[A-Z][a-zA-Z]+\b|\w+_\w+/

function collectLabels(nodes: MapNode[], into: Array<{ id: string; label: string }>): typeof into {
  for (const n of nodes) {
    if (n.style !== 'text') into.push({ id: n.id, label: n.label })
    collectLabels(n.children, into)
  }
  return into
}

/** A map must read cold: a central idea and a numbered story, with no repeated step. */
function checkReadability(doc: MapDocument): ParseError[] {
  const warn = (message: string): ParseError => ({ line: 0, message, level: 'warning' })
  const out: ParseError[] = []
  if (!doc.summary) out.push(warn('missing "summary" — the one-line central idea'))
  // An architecture map is structure, not a story: no steps required, tech names expected.
  if (doc.kind === 'architecture') return out
  if (!doc.edges.some((e) => e.step !== null)) out.push(warn('no numbered steps — number the story: "1 a -> b"'))
  // Maps are read by people: file / function names belong in [code=…], not on the box.
  for (const { id, label } of collectLabels(doc.nodes, [])) {
    if (CODE_TALK.test(label)) out.push(warn(`${id}: "${label.replace(/\n/g, ' ')}" sounds like code — say it in plain words`))
  }
  const seen = new Set<string>()
  for (const e of doc.edges) {
    if (e.step === null) continue
    if (!e.label) out.push(warn(`step ${e.step} (${e.from} → ${e.to}) has no action — say what happens`))
    const key = `${e.scope ?? ''}#${e.step}`
    if (seen.has(key)) out.push(warn(`step ${e.step} used twice in ${e.scope ?? 'the top level'}`))
    seen.add(key)
  }
  return out
}
