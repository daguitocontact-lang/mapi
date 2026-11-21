import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { renderMap } from '../../render-map'
import type { McpContext } from '../context'
import { failure, text } from '../context'
import { MapInput } from './shared'
import { sourceOf } from './shared'

export function registerGetPlacementTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_placement',
    {
      title: 'Get placement (see the map as text)',
      description:
        'Lay the map out and describe where everything landed, as compact text you can reason about instead of an image: the ruler cell of every box (A1, C4–E5…), every line\'s route through cells with turn directions (e.g. "G1↓G4←F4"), its length, bends and label cell, LONG lines flagged, and the crossing count. Use it to spot what is far apart, what crosses, what blocks a line — then move boxes (col=, row=, at=) with write_map and check again.',
      inputSchema: MapInput,
      outputSchema: z.object({ placement: z.string(), crossings: z.number(), overlaps: z.array(z.string()) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const src = sourceOf(ctx, input)
      if ('error' in src) return failure(src.error)
      const r = await renderMap(src.source, { focus: input.focus, context: input.context })
      const overlaps = r.placed.overlaps.map((o) => `${o.kind}: ${o.a} × ${o.b}`)
      const body = overlaps.length > 0 ? `${r.placement}\noverlaps:\n  ${overlaps.join('\n  ')}` : r.placement
      return { content: [text(body)], structuredContent: { placement: r.placement, crossings: r.placed.crossings, overlaps } }
    },
  )
}
