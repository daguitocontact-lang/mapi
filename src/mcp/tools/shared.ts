import { z } from 'zod'
import { RENDER_THEMES } from '../../render/theme'
import type { McpContext } from '../context'
import { readMap } from '../context'

/** Every drawing tool takes a saved map (`path`) or inline text (`source`), plus the view. */
export const MapInput = z.object({
  path: z.string().optional().describe('Map path relative to the maps folder (from list_maps)'),
  source: z.string().optional().describe('Inline Mapi text, to check a draft before saving it'),
  focus: z.string().optional().describe('Drill into this group/box id instead of the whole map'),
  context: z.boolean().optional().describe('Include technical detail (stores, services) besides the essentials'),
})

export const ViewStyle = {
  theme: z.enum(RENDER_THEMES).optional().describe('"light" (default) or "dark"'),
}

/** The map text for a call: inline source wins, otherwise the saved file. */
export function sourceOf(ctx: McpContext, input: { path?: string; source?: string }): { source: string; label: string } | { error: string } {
  if (input.source) return { source: input.source, label: 'inline source' }
  if (!input.path) return { error: 'pass either "path" (a saved map) or "source" (Mapi text)' }
  const map = readMap(ctx, input.path)
  return 'error' in map ? map : { source: map.source, label: map.rel }
}

export const ProblemList = z.array(z.object({ line: z.number(), message: z.string() }))
