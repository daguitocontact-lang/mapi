import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'
import type { Placed, PlacedEdge, PlacedNode } from '../layout'
import { CHIP_FONT, CHIP_LOGO, CHIP_LOGO_GAP, EDGE_LABEL_SIZE, FONT_SIZE, GROUP_ICON, STEP_BADGE, crossingPoints } from '../layout'
import type { Palette, RenderStyle, RenderTheme } from './theme'
import { branchColor, paletteFor } from './theme'
import { isSubStep } from '../model'
import { ICON_TILE, ID_SIZE } from '../layout/build'
import { labelOffsetY, roundedRectPath, shapePath } from './shapes'
import { getIcon } from '../icons'
import { textWidth } from '../measure'

const generator = rough.generator({
  // One smooth hand-drawn pass per line, like Excalidraw — the default double
  // stroke reads as scribbly at diagram scale.
  options: { disableMultiStroke: true, disableMultiStrokeFill: true, bowing: 0.6, preserveVertices: true },
})
const ARROW_LEN = 10

function seedOf(key: string): number {
  let h = 7
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 2147483647
  return h || 1
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function roughPaths(drawable: ReturnType<typeof generator.path>, dashed: boolean): string {
  const dash = dashed ? ' stroke-dasharray="6 6"' : ''
  return generator
    .toPaths(drawable)
    .map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? 'none'}"${dash}/>`)
    .join('')
}

type TextArgs = { text: string; x: number; y: number; size: number; color: string; anchor: string; weight?: number; font?: string }

function textBlock(args: TextArgs): string {
  const lines = args.text.split('\n')
  const lineHeight = args.size * 1.35
  const startY = args.y - ((lines.length - 1) * lineHeight) / 2
  return lines
    .map(
      (line, i) =>
        `<text x="${args.x}" y="${startY + i * lineHeight}" font-size="${args.size}" fill="${args.color}"${args.weight ? ` font-weight="${args.weight}"` : ''}${args.font ? ` font-family="${args.font.replace(/"/g, "'")}"` : ''} ` +
        `text-anchor="${args.anchor}" dominant-baseline="middle">${escapeXml(line)}</text>`,
    )
    .join('')
}

const STACK_OFFSET = 6
const ID_TAG_H = 15

function drawIdTag(node: PlacedNode, palette: Palette): string {
  const w = node.id.length * ID_SIZE * 0.62 + 12
  const x = node.x + 10
  const y = node.y - ID_TAG_H / 2
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${ID_TAG_H}" rx="${ID_TAG_H / 2}" fill="${palette.background}" stroke="${palette.muted}" stroke-width="0.8"/>` +
    `<text x="${x + w / 2}" y="${y + ID_TAG_H / 2}" font-size="${ID_SIZE}" fill="${palette.muted}" text-anchor="middle" dominant-baseline="middle" font-family="ui-monospace, Menlo, monospace">${escapeXml(node.id)}</text>`
  )
}
const LOGO_PLATE = 26
const LOGO_GAP = 9

function linkIcon(x: number, y: number, palette: Palette): string {
  const s = 9
  const d = `M${x + 4},${y} H${x + s} V${y + s - 4} M${x + s},${y} L${x + 2},${y + 7} M${x},${y + 3} V${y + s} H${x + 6}`
  return `<path d="${d}" stroke="${palette.muted}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
}

/** Cloud-diagram style: a big logo with the name centred under it, no box around. */
/** The named outline colours a map may use (`[color=…]`), cloud-diagram style. */
const OUTLINE: Record<string, string> = {
  purple: '#8c4fff',
  pink: '#e7157b',
  orange: '#ed7100',
  green: '#7aa116',
  blue: '#147eba',
  gray: '#7d8998',
  red: '#dd344c',
}
const BADGE = 22

/** A numbered marker (`[badge=4]`) in the top-right corner — like a reference diagram's callouts. */
function drawBadge(node: PlacedNode, x: number, y: number): string {
  if (!node.badge) return ''
  return (
    `<rect x="${x}" y="${y}" width="${BADGE}" height="${BADGE}" rx="4" fill="#147eba"/>` +
    `<text x="${x + BADGE / 2}" y="${y + BADGE / 2}" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif">${escapeXml(node.badge)}</text>`
  )
}

function drawIconTile(node: PlacedNode, palette: Palette, showIds: boolean): string {
  const logo = node.icon ? getIcon(node.icon) : null
  const cx = node.x + node.w / 2
  const art = logo
    ? `<svg x="${cx - ICON_TILE / 2}" y="${node.y + 4}" width="${ICON_TILE}" height="${ICON_TILE}" viewBox="0 0 ${logo.width} ${logo.height}" color="${palette.text}">${logo.body}</svg>`
    : `<rect x="${cx - ICON_TILE / 2}" y="${node.y + 4}" width="${ICON_TILE}" height="${ICON_TILE}" rx="10" fill="none" stroke="${palette.muted}"/>`
  const label = textBlock({ text: node.label, x: cx, y: node.y + ICON_TILE + 14 + (node.h - ICON_TILE - 18) / 2, size: FONT_SIZE, color: palette.text, anchor: 'middle', weight: palette.labelWeight })
  const idTag = showIds ? drawIdTag(node, palette) : ''
  const ref = node.cloneOf ? ` data-ref="${escapeXml(node.cloneOf)}"` : ''
  const badge = drawBadge(node, cx + ICON_TILE / 2 + 6, node.y + 4)
  return `<g data-id="${escapeXml(node.id)}"${ref} cursor="pointer">${art + label + idTag + badge}</g>`
}

function drawNode(node: PlacedNode, palette: Palette, showIds: boolean, branch: string | null): string {
  const opts: Options = {
    // Reference chips (copies of a shared box) read lighter than the boxes that use them.
    stroke: node.color ? OUTLINE[node.color]! : node.style === 'dashed' || node.attachedTo ? palette.muted : branch ?? palette.nodeStroke,
    strokeWidth: branch ? 1.6 : 1.2,
    roughness: palette.roughness,
    seed: seedOf(node.id),
    fill: node.isGroup ? undefined : palette.fill,
    fillStyle: 'solid',
  }
  // Groups are always plain containers; leaves draw the shape that says what they are.
  const shape = node.isGroup ? 'step' : node.shape
  // A collapsed group reads as a stack of cards. Both cards live INSIDE the laid-out
  // box (front shrunk, back offset) so edges meet a real outline, never a gap.
  const inset = node.stacked ? STACK_OFFSET : 0
  const card = { w: node.w - inset, h: node.h - inset }
  const outline = (dx: number) =>
    roughPaths(
      generator.path(shapePath(shape, { x: node.x + dx, y: node.y + dx, ...card }, node.attachedTo ? card.h / 2 : palette.radius), opts),
      node.style === 'dashed',
    )
  const stack = node.stacked ? outline(STACK_OFFSET) : ''
  const chip = node.attachedTo !== null
  const shadowed = palette.shadow && !node.isGroup && !chip && node.style === 'solid' ? ' filter="url(#soft)"' : ''
  const fontSize = chip ? CHIP_FONT : FONT_SIZE
  const plate = chip ? CHIP_LOGO : LOGO_PLATE
  const plateGap = chip ? CHIP_LOGO_GAP : LOGO_GAP
  const body = node.style === 'text' ? '' : `<g${shadowed}>${outline(0)}</g>`
  if (shape === 'icon' && !node.isGroup) return drawIconTile(node, palette, showIds)
  // Logo + label read as ONE centred unit: plate, fixed gap, then the text.
  const logo = node.icon && !node.isGroup ? getIcon(node.icon) : null
  let textStart: number | null = null
  let logoSvg = ''
  if (logo) {
    const textW = Math.max(...node.label.split('\n').map((l) => textWidth(l, fontSize, 'sketch')))
    const unit = plate + plateGap + textW
    const left = node.x + card.w / 2 - unit / 2
    const cy = node.y + card.h / 2 + labelOffsetY(shape)
    textStart = left + plate + plateGap
    const inset = chip ? 2 : 4
    const inner = plate - inset * 2
    // A small light plate keeps dark logos (Expo, GitHub…) visible on dark themes.
    logoSvg =
      `<rect x="${left}" y="${cy - plate / 2}" width="${plate}" height="${plate}" rx="${chip ? 4 : 7}" fill="${palette.logoPlate}"/>` +
      `<svg x="${left + inset}" y="${cy - inner / 2}" width="${inner}" height="${inner}" viewBox="0 0 ${logo.width} ${logo.height}" color="${palette.text}">${logo.body}</svg>`
  }
  // A group may carry an icon left of its title (AWS Cloud, VPC, a factory…).
  const groupIcon = node.isGroup && node.icon ? getIcon(node.icon) : null
  const titleX = node.x + 16 + (groupIcon ? GROUP_ICON + 6 : 0)
  const groupIconSvg = groupIcon
    ? `<svg x="${node.x + 14}" y="${node.y + 10}" width="${GROUP_ICON}" height="${GROUP_ICON}" viewBox="0 0 ${groupIcon.width} ${groupIcon.height}" color="${palette.text}">${groupIcon.body}</svg>`
    : ''
  const label = node.isGroup
    ? groupIconSvg + textBlock({ text: node.label, x: titleX, y: node.y + (groupIcon ? 26 : 22), size: FONT_SIZE - 1, color: palette.text, anchor: 'start' })
    : textBlock({
        text: node.label,
        // With a logo the lines align left right after it; otherwise they are centred.
        x: textStart ?? node.x + card.w / 2,
        y: node.y + card.h / 2 + labelOffsetY(shape),
        size: fontSize,
        color: chip ? palette.muted : palette.text,
        anchor: textStart === null ? 'middle' : 'start',
        weight: palette.labelWeight,
      })
  // The id is a small tag sitting ON the top border (its own background), so turning
  // ids on never changes the layout — boxes stay exactly where they were.
  const idTag = showIds && !node.isGroup ? drawIdTag(node, palette) : ''
  const drill = node.drillable ? ' data-drill="1"' : ''
  const link = node.link ? ` data-link="${escapeXml(node.link)}"` : ''
  const ref = node.cloneOf ? ` data-ref="${escapeXml(node.cloneOf)}"` : ''
  // "Opens another map" mark: a small box-with-arrow drawn in the top-right corner.
  const icon = node.link ? linkIcon(node.x + card.w - 16, node.y + 8, palette) : ''
  const badge = drawBadge(node, node.x + card.w - BADGE - 8, node.y + 8)
  return `<g data-id="${escapeXml(node.id)}"${drill}${ref} ${link} cursor="pointer">${stack + body + logoSvg + label + icon + idTag + badge}</g>`
}

function arrowHead(tip: [number, number], from: [number, number], opts: Options): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const wing = (offset: number): [number, number] => [
    tip[0] - ARROW_LEN * Math.cos(angle + offset),
    tip[1] - ARROW_LEN * Math.sin(angle + offset),
  ]
  return roughPaths(generator.linearPath([wing(0.45), tip, wing(-0.45)], opts), false)
}

const HOP_RADIUS = 9
const HOP_HALO = 7

type Hopped = { runs: Array<Array<[number, number]>>; arcs: string[] }

/** Split a polyline at every crossing on its horizontal runs: straight runs stay sketchy,
 *  each hop becomes a clean semicircle (rough.js breaks small arcs into fragments). */
function splitAtHops(pts: Array<[number, number]>, hops: Array<[number, number]>): Hopped {
  const runs: Array<Array<[number, number]>> = [[pts[0]!]]
  const arcs: string[] = []
  pts.slice(1).forEach((b, i) => {
    const a = pts[i]!
    const dir = Math.sign(b[0] - a[0])
    const onRun =
      Math.abs(a[1] - b[1]) < 1
        ? hops
            .filter((h) => Math.abs(h[1] - a[1]) < 1 && (h[0] - a[0]) * dir > HOP_RADIUS && (b[0] - h[0]) * dir > HOP_RADIUS)
            .sort((p, q) => (p[0] - q[0]) * dir)
        : []
    for (const h of onRun) {
      const start: [number, number] = [h[0] - HOP_RADIUS * dir, h[1]]
      const end: [number, number] = [h[0] + HOP_RADIUS * dir, h[1]]
      runs[runs.length - 1]!.push(start)
      arcs.push(`M${start[0]},${start[1]} A${HOP_RADIUS},${HOP_RADIUS} 0 0 ${dir > 0 ? 1 : 0} ${end[0]},${end[1]}`)
      runs.push([end])
    }
    runs[runs.length - 1]!.push(b)
  })
  return { runs, arcs }
}

type EdgeDraw = { edge: PlacedEdge; index: number; palette: Palette; hops: Array<[number, number]>; hasStory: boolean }

/** The numbered story is drawn bold; unnumbered context edges recede (thin, muted). */
function drawEdge({ edge, index, palette, hops, hasStory }: EdgeDraw): string {
  if (edge.points.length < 2) return ''
  const isContext = hasStory && (edge.step === null || isSubStep(edge.step))
  const branch = branchColor(palette, edge.step)
  const opts: Options = {
    stroke: isContext ? palette.muted : branch ?? palette.stroke,
    strokeWidth: isContext ? 0.8 : hasStory ? 1.8 : 1.1,
    roughness: palette.roughness * 0.6,
    seed: seedOf(`e${index}`),
  }
  const dashed = edge.kind === 'dashed'
  const pts = edge.points
  const { runs, arcs } = splitAtHops(pts, hops)
  let out = runs.map((run) => roughPaths(generator.linearPath(run, opts), dashed)).join('')
  // The halo (background-coloured, wider) cuts the line underneath so the hop clearly
  // passes OVER it instead of reading as a junction.
  for (const d of arcs) {
    out += `<path d="${d}" stroke="${palette.background}" stroke-width="${HOP_HALO}" fill="none"/>`
    out += `<path d="${d}" stroke="${opts.stroke}" stroke-width="${opts.strokeWidth}" fill="none" stroke-linecap="round"/>`
  }
  out += arrowHead(pts[pts.length - 1]!, pts[pts.length - 2]!, opts)
  if (edge.kind === 'both') out += arrowHead(pts[0]!, pts[1]!, opts)
  if (edge.labelBox) out += drawEdgeLabel(edge, palette, isContext)
  // Invisible wide stroke: a thin line is hard to click otherwise.
  const hit = `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke"/>`
  const step = edge.step ? ` data-step="${escapeXml(edge.step)}"` : ''
  return `<g data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}"${step} cursor="pointer">${hit}${out}</g>`
}

function drawEdgeLabel(edge: PlacedEdge, palette: Palette, isContext: boolean): string {
  const b = edge.labelBox!
  let out = ''
  let textX = b.x
  if (edge.step !== null) {
    // A step from the outer story is shown as ↑5 so it never reads as this level's own 5.
    const shown = edge.outer ? `↑${edge.step}` : edge.step
    const w = STEP_BADGE + (shown.length - 1) * 8
    const cy = b.y + b.h / 2
    const fill = isContext ? palette.muted : branchColor(palette, edge.step) ?? palette.stroke
    // Outer-story steps and context sub-steps are outlined; own story steps are solid.
    const outlined = edge.outer || isContext
    const pill = outlined
      ? `fill="${palette.background}" stroke="${fill}" stroke-width="1.5"`
      : `fill="${fill}"`
    if (palette.roughness > 0) {
      const box = { x: b.x + 0.75, y: cy - STEP_BADGE / 2 + 0.75, w: w - 1.5, h: STEP_BADGE - 1.5 }
      const opts: Options = outlined
        ? { stroke: fill, strokeWidth: 1.4, roughness: 0.7, fill: palette.background, fillStyle: 'solid', seed: seedOf(`b${edge.step}`) }
        : { stroke: fill, strokeWidth: 1, roughness: 0.7, fill, fillStyle: 'solid', seed: seedOf(`b${edge.step}`) }
      out += roughPaths(generator.path(roundedRectPath(box, STEP_BADGE / 2), opts), false)
    } else {
      out += `<rect x="${b.x + 0.75}" y="${cy - STEP_BADGE / 2 + 0.75}" width="${w - 1.5}" height="${STEP_BADGE - 1.5}" rx="${STEP_BADGE / 2}" ${pill}/>`
    }
    const numberColor = outlined ? fill : palette.background
    out += textBlock({ text: shown, x: b.x + w / 2, y: cy + 1, size: EDGE_LABEL_SIZE, color: numberColor, anchor: 'middle', weight: 600 })
    textX += w + 6
  }
  if (edge.label && edge.step === null) {
    // Inline label: a background pill cuts the line so the text sits cleanly on it.
    out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="${palette.background}"/>`
    out += textBlock({ text: edge.label, x: b.x + b.w / 2, y: b.y + b.h / 2, size: EDGE_LABEL_SIZE, color: palette.muted, anchor: 'middle' })
    return out
  }
  if (edge.label) {
    const color = isContext ? palette.muted : palette.text
    out += textBlock({ text: edge.label, x: textX, y: b.y + b.h / 2, size: EDGE_LABEL_SIZE, color, anchor: 'start' })
  }
  return out
}

/** A soft plate behind a box and its reference chips, so the chips read as "this box uses…". */
function drawUsePlates(placed: Placed, palette: Palette): string {
  const owners = [...new Set(placed.nodes.flatMap((n) => (n.attachedTo ? [n.attachedTo] : [])))]
  return owners
    .map((id) => {
      const members = placed.nodes.filter((n) => n.id === id || n.attachedTo === id)
      const pad = 10
      const x = Math.min(...members.map((n) => n.x)) - pad
      const y = Math.min(...members.map((n) => n.y)) - pad
      const w = Math.max(...members.map((n) => n.x + n.w)) - x + pad
      const h = Math.max(...members.map((n) => n.y + n.h)) - y + pad
      const plate = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${palette.radius + 6}" fill="${palette.grid}" fill-opacity="0.7"/>`
      return plate + drawUseTree(placed.nodes.find((n) => n.id === id)!, members.filter((n) => n.id !== id), palette)
    })
    .join('')
}

const TREE_ARROW = 4

/**
 * Short lines INSIDE the plate: from the box's side to a spine, one branch into each chip —
 * the "uses" relation stays visible without lines wandering across the map.
 */
function drawUseTree(owner: PlacedNode, chips: PlacedNode[], palette: Palette): string {
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${palette.muted}" stroke-width="1.1"/>`
  const head = (x: number, y: number, dir: 1 | -1) =>
    `<path d="M${x - dir * TREE_ARROW * 1.4},${y - TREE_ARROW} L${x},${y} L${x - dir * TREE_ARROW * 1.4},${y + TREE_ARROW}" fill="none" stroke="${palette.muted}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`
  const midY = owner.y + owner.h / 2
  const side = (cs: PlacedNode[], dir: 1 | -1) => {
    if (cs.length === 0) return ''
    const from = dir === 1 ? owner.x + owner.w : owner.x
    const spine = from + dir * 16
    const ys = cs.map((c) => c.y + c.h / 2)
    let out = line(from, midY, spine, midY) + line(spine, Math.min(midY, ...ys), spine, Math.max(midY, ...ys))
    for (const c of cs) {
      const cy = c.y + c.h / 2
      const edge = dir === 1 ? c.x : c.x + c.w
      out += line(spine, cy, edge, cy) + head(edge, cy, dir)
    }
    return out
  }
  return side(chips.filter((c) => c.x >= owner.x + owner.w), 1) + side(chips.filter((c) => c.x + c.w <= owner.x), -1)
}

function drawLanes(placed: Placed, palette: Palette): string {
  return placed.lanes
    .map((lane) => {
      const opts: Options = { stroke: palette.muted, strokeWidth: 1, roughness: palette.roughness * 0.6, seed: seedOf(`lane:${lane.name}`) }
      const frame = roughPaths(generator.path(roundedRectPath(lane.box, palette.radius + 4), opts), true)
      const title = textBlock({ text: lane.name, x: lane.box.x + 16, y: lane.box.y + 16, size: FONT_SIZE - 1, color: palette.muted, anchor: 'start' })
      return frame + title
    })
    .join('')
}

function drawBands(placed: Placed, palette: Palette): string {
  return placed.bands
    .map((band) => {
      const label = textBlock({ text: band.name, x: placed.width - 200, y: band.top + 12, size: FONT_SIZE, color: palette.text, anchor: 'start' })
      if (band.dividerY === null) return label
      const y = band.dividerY
      const opts: Options = { stroke: palette.muted, strokeWidth: 0.8, roughness: palette.roughness * 0.4, seed: seedOf(band.name) }
      return label + roughPaths(generator.line(40, y, placed.width - 20, y, opts), true)
    })
    .join('')
}

/** A box takes a path's colour when every story edge touching it is on that one path. */
function nodeBranch(placed: Placed, id: string, palette: Palette): string | null {
  const touching = placed.edges.filter((e) => e.step !== null && !isSubStep(e.step) && (e.from === id || e.to === id))
  const colours = new Set(touching.map((e) => branchColor(palette, e.step)))
  if (touching.length === 0 || colours.size !== 1) return null
  return [...colours][0] ?? null
}

export type RenderOptions = {
  style: RenderStyle
  theme: RenderTheme
  background?: boolean
  /** Print each box's id under its label so a screenshot maps straight to the source. */
  showIds?: boolean
}

export function renderSvg(placed: Placed, options: RenderOptions): string {
  const p = paletteFor(options.style, options.theme)
  const background =
    options.background === false
      ? ''
      : `<rect width="100%" height="100%" fill="${p.background}"/><rect width="100%" height="100%" fill="url(#grid)"/>`
  const { width, height } = placed
  const grid =
    `<defs><pattern id="grid" width="${p.gridSize}" height="${p.gridSize}" patternUnits="userSpaceOnUse">` +
    `<path d="M ${p.gridSize} 0 L 0 0 0 ${p.gridSize}" fill="none" stroke="${p.grid}" stroke-width="1"/></pattern>` +
    `<filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="${options.theme === 'dark' ? 0.5 : 0.08}"/></filter></defs>`
  const title = placed.title
    ? textBlock({ text: placed.title, x: 60, y: 56, size: 26, color: p.text, anchor: 'start', weight: options.style === 'clean' ? 700 : undefined, font: p.titleFont })
    : ''
  const hops = crossingPoints(placed.edges)
  const hasStory = placed.edges.some((e) => e.step !== null && !e.outer && !isSubStep(e.step))
  const groups = placed.nodes.filter((n) => n.isGroup)
  const leaves = placed.nodes.filter((n) => !n.isGroup)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${p.font.replace(/"/g, "'")}">`,
    grid,
    background,
    title,
    drawBands(placed, p),
    drawLanes(placed, p),
    drawUsePlates(placed, p),
    ...groups.map((n) => drawNode(n, p, options.showIds ?? false, null)),
    // Edges that hop over others are drawn last so their hop sits on top.
    ...placed.edges
      .map((e, i) => ({ i, hopsAt: hops.filter((h) => h.edge === i).map((h) => h.at) }))
      .sort((p, q) => p.hopsAt.length - q.hopsAt.length)
      .map(({ i, hopsAt }) => drawEdge({ edge: placed.edges[i]!, index: i, palette: p, hops: hopsAt, hasStory })),
    ...leaves.map((n) => drawNode(n, p, options.showIds ?? false, nodeBranch(placed, n.id, p))),
    '</svg>',
  ].join('')
}
