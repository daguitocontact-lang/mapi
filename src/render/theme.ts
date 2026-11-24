export const RENDER_THEMES = ['dark', 'light'] as const
export type RenderTheme = (typeof RENDER_THEMES)[number]

export const GRID_KINDS = ['lines', 'dots'] as const
export type GridKind = (typeof GRID_KINDS)[number]

export type Palette = {
  background: string
  grid: string
  gridKind: GridKind
  gridSize: number
  /** Story edges and step badges. */
  stroke: string
  /** Box outline (quieter than the story lines). */
  nodeStroke: string
  fill: string
  text: string
  muted: string
  font: string
  titleFont: string
  labelWeight: number
  radius: number
  /** Background plate behind brand logos (keeps dark logos visible). */
  logoPlate: string
  /** Ink for monochrome icons on that plate — the plate is light in every theme. */
  logoInk: string
  /** Sticky note (`[note]`): paper and edge. */
  noteFill: string
  noteStroke: string
  /** One colour per alternative path (step letter a, b, c…). Green is reserved for "live". */
  branches: string[]
}

const LABEL_FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"
const TITLE_FONT = "Outfit, Inter, 'Helvetica Neue', Arial, sans-serif"
const DARK_BRANCHES = ['#60a5fa', '#fbbf24', '#c084fc', '#f472b6', '#2dd4bf', '#fb923c']
const LIGHT_BRANCHES = ['#2563eb', '#d97706', '#9333ea', '#db2777', '#0d9488', '#ea580c']

// A quiet product identity: #fafafa / #0a0a0a, dot grid, quiet borders, soft shadow,
// radius 12, Outfit titles + Inter labels.
const PALETTES: Record<RenderTheme, Palette> = {
  dark: {
    background: '#0a0a0a', grid: '#2a2a2a', gridKind: 'dots', gridSize: 20,
    stroke: '#fafafa', nodeStroke: '#ffffff2e', fill: '#171717', text: '#fafafa', muted: '#8a8a8a',
    font: LABEL_FONT, titleFont: TITLE_FONT, labelWeight: 500,
    radius: 12, branches: DARK_BRANCHES, logoPlate: '#f2f2f2', logoInk: '#0a0a0a',
    noteFill: '#2a2615', noteStroke: '#7a6a24',
  },
  light: {
    background: '#fafafa', grid: '#dcdcdc', gridKind: 'dots', gridSize: 20,
    stroke: '#171717', nodeStroke: '#0000001f', fill: '#ffffff', text: '#0a0a0a', muted: '#737373',
    font: LABEL_FONT, titleFont: TITLE_FONT, labelWeight: 500,
    radius: 12, branches: LIGHT_BRANCHES, logoPlate: '#f2f2f2', logoInk: '#0a0a0a',
    noteFill: '#fff8d6', noteStroke: '#e3c65a',
  },
}

export function paletteFor(theme: RenderTheme): Palette {
  return PALETTES[theme]
}

/** The alternative-path letter of a step ("2b" → "b"), or null for the shared story. */
export function branchOf(step: string | null): string | null {
  return step?.match(/^\d+([a-z])$/)?.[1] ?? null
}

export function branchColor(palette: Palette, step: string | null): string | null {
  const letter = branchOf(step)
  if (!letter) return null
  return palette.branches[(letter.charCodeAt(0) - 97) % palette.branches.length] ?? null
}
