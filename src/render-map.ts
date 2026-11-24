import type { MapDocument, ParseError } from './model'
import type { MapView } from './focus'
import type { Placed } from './layout'
import type { RenderTheme } from './render/theme'
import { describePlacement } from './describe'
import { viewDocument } from './focus'
import { layoutMap } from './layout'
import { parseMapi } from './parse'
import { renderSvg } from './render/svg'

export type RenderOptions = {
  theme?: RenderTheme
  /** Drill into this group/box id (null = the whole map). */
  focus?: string | null
  /** Show the technical detail (stores, services) as well as the essentials. */
  context?: boolean
  /** Draw each box id as a small tag (handy for screenshots and for pointing at things). */
  showIds?: boolean
  /** Paint the page background (off when the viewer draws its own infinite canvas). */
  background?: boolean
}

export type RenderedMap = {
  doc: MapDocument
  view: MapView
  placed: Placed
  svg: string
  /** The placement text: ruler cells, line routes, lengths, bends, crossings. */
  placement: string
  /** Parse errors and overlaps — anything drawn on top of anything is an error. */
  errors: ParseError[]
  warnings: ParseError[]
}

/** The one pipeline every surface uses (viewer, MCP, CLI): text → layout → SVG + placement. */
export async function renderMap(source: string, options: RenderOptions = {}): Promise<RenderedMap> {
  const theme = options.theme ?? 'light'
  const parsed = parseMapi(source)
  const view = viewDocument(parsed.doc, { focusId: options.focus ?? null, context: options.context ?? false })
  const placed = await layoutMap(view.doc, { drillable: view.drillable, showIds: options.showIds ?? false })
  const svg = renderSvg(placed, { theme, background: options.background ?? true, showIds: options.showIds ?? false })
  const overlaps: ParseError[] = placed.overlaps.map((o) => ({ line: 0, message: `overlap ${o.kind}: ${o.a} × ${o.b}` }))
  const all = [...parsed.errors, ...overlaps]
  return {
    doc: parsed.doc,
    view,
    placed,
    svg,
    placement: describePlacement(placed),
    errors: all.filter((e) => e.level !== 'warning'),
    warnings: all.filter((e) => e.level === 'warning'),
  }
}
