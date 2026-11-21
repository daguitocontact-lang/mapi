import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { listLibrary } from '../../library'
import type { McpContext } from '../context'
import { text } from '../context'

export function registerListMapsTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_maps',
    {
      title: 'List maps',
      description:
        'List every Mapi map (.mapi file) in the maps folder, with its path, title, kind (flow or architecture) and section. Start here to find a map, then use read_map, get_placement or render_map with its path.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        maps: z.array(z.object({ path: z.string(), title: z.string(), kind: z.string(), section: z.array(z.string()) })),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const maps = listLibrary(ctx.root).map(({ path, title, kind, section }) => ({ path, title, kind, section }))
      const lines = maps.map((m) => `${m.path} — ${m.title} (${m.kind})`)
      return { content: [text(lines.length > 0 ? lines.join('\n') : 'No .mapi files in the maps folder yet.')], structuredContent: { maps } }
    },
  )
}
