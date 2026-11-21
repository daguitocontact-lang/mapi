import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { McpContext } from '../context'
import { failure, readMap, text } from '../context'

export function registerReadMapTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'read_map',
    {
      title: 'Read a map',
      description: 'Return the Mapi source text of a map by its path (as listed by list_maps). Edit it and save it back with write_map.',
      inputSchema: z.object({ path: z.string().describe('Map path relative to the maps folder, e.g. "1-demo/payments.mapi"') }),
      outputSchema: z.object({ path: z.string(), source: z.string() }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      const map = readMap(ctx, path)
      if ('error' in map) return failure(map.error)
      return { content: [text(map.source)], structuredContent: { path: map.rel, source: map.source } }
    },
  )
}
