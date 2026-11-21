export const RENDER_STYLES = ['sketch', 'clean'] as const
export type RenderStyle = (typeof RENDER_STYLES)[number]

export const RENDER_THEMES = ['dark', 'light'] as const
export type RenderTheme = (typeof RENDER_THEMES)[number]

export const GRID_KINDS = ['lines', 'dots'] as const
export type GridKind = (typeof GRID_KINDS)[number]

export type Palette = {
  background: string
  grid: string
  gridKind: GridKind
  gridSize: number
  /** Story edges, badges and hand-drawn outlines. */
  stroke: string
  /** Box outline (clean style uses a quieter border than the story lines). */
  nodeStroke: string
  fill: string
  text: string
  muted: string
  font: string
  titleFont: string
  labelWeight: number
  /** Soft drop shadow under boxes (clean style). */
  shadow: boolean
  radius: number
  roughness: number
  /** Background plate behind brand logos (keeps dark logos visible). */
  logoPlate: string
  /** One colour per alternative path (step letter a, b, c…). Green is reserved for "live". */
  branches: string[]
}

const SKETCH_FONT = "Excalifont, 'Comic Sans MS', cursive"
const CLEAN_FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"
const CLEAN_TITLE = "Outfit, Inter, 'Helvetica Neue', Arial, sans-serif"
const DARK_BRANCHES = ['#60a5fa', '#fbbf24', '#c084fc', '#f472b6', '#2dd4bf', '#fb923c']
const LIGHT_BRANCHES = ['#2563eb', '#d97706', '#9333ea', '#db2777', '#0d9488', '#ea580c']

// Two looks. Sketch = Excalidraw-like hand drawing on a line grid. Clean =
// a quiet product identity: #fafafa / #0a0a0a, dot grid, quiet borders, soft shadow,
// radius 12, Outfit titles + Inter labels.
const PALETTES: Record<RenderStyle, Record<RenderTheme, Palette>> = {
  sketch: {
    dark: {
      background: '#121212', grid: '#262626', gridKind: 'lines', gridSize: 40,
      stroke: '#e5e5e5', nodeStroke: '#e5e5e5', fill: '#1a1a1a', text: '#f5f5f5', muted: '#a3a3a3',
      font: SKETCH_FONT, titleFont: SKETCH_FONT, labelWeight: 400, shadow: false,
      radius: 14, roughness: 1, branches: DARK_BRANCHES, logoPlate: '#f2f2f2',
    },
    light: {
      background: '#fdfdfd', grid: '#f0f0f0', gridKind: 'lines', gridSize: 40,
      stroke: '#1e1e1e', nodeStroke: '#1e1e1e', fill: '#ffffff', text: '#0a0a0a', muted: '#737373',
      font: SKETCH_FONT, titleFont: SKETCH_FONT, labelWeight: 400, shadow: false,
      radius: 14, roughness: 1, branches: LIGHT_BRANCHES, logoPlate: '#f2f2f2',
    },
  },
  clean: {
    dark: {
      background: '#0a0a0a', grid: '#2a2a2a', gridKind: 'dots', gridSize: 20,
      stroke: '#fafafa', nodeStroke: '#ffffff2e', fill: '#171717', text: '#fafafa', muted: '#8a8a8a',
      font: CLEAN_FONT, titleFont: CLEAN_TITLE, labelWeight: 500, shadow: true,
      radius: 12, roughness: 0, branches: DARK_BRANCHES, logoPlate: '#f2f2f2',
    },
    light: {
      background: '#fafafa', grid: '#dcdcdc', gridKind: 'dots', gridSize: 20,
      stroke: '#171717', nodeStroke: '#0000001f', fill: '#ffffff', text: '#0a0a0a', muted: '#737373',
      font: CLEAN_FONT, titleFont: CLEAN_TITLE, labelWeight: 500, shadow: true,
      radius: 12, roughness: 0, branches: LIGHT_BRANCHES, logoPlate: '#f2f2f2',
    },
  },
}

export function paletteFor(style: RenderStyle, theme: RenderTheme): Palette {
  return PALETTES[style][theme]
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
