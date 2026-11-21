import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { renderMap } from '../../render-map'
import type { McpContext } from '../context'
import { failure, text } from '../context'
import { MapInput, ViewStyle, sourceOf } from './shared'

export function registerRenderMapTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'render_map',
    {
      title: 'Render a map to SVG',
      description:
        'Draw a map as an SVG image. Returns the SVG text, or writes it to "out" (an .svg path inside the maps folder) and returns where. Prefer get_placement to reason about the layout; use this to hand the picture to a person.',
      inputSchema: MapInput.extend({
        ...ViewStyle,
        out: z.string().optional().describe('Write the SVG here (relative to the maps folder, must end in .svg)'),
      }),
      outputSchema: z.object({ width: z.number(), height: z.number(), out: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const src = sourceOf(ctx, input)
      if ('error' in src) return failure(src.error)
      const r = await renderMap(src.source, { focus: input.focus, context: input.context, style: input.style, theme: input.theme })
      const size = { width: Math.round(r.placed.width), height: Math.round(r.placed.height) }
      if (!input.out) return { content: [text(r.svg)], structuredContent: size }
      if (!input.out.endsWith('.svg') || input.out.includes('..') || input.out.startsWith('/')) {
        return failure('"out" must be a relative .svg path inside the maps folder')
      }
      const abs = `${ctx.root}/${input.out}`
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, r.svg)
      return { content: [text(`wrote ${input.out} (${size.width}×${size.height})`)], structuredContent: { ...size, out: input.out } }
    },
  )
}
