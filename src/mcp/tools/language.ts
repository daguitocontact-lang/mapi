import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { languageReference, text } from '../context'

export function registerLanguageTool(server: McpServer): void {
  server.registerTool(
    'get_language_reference',
    {
      title: 'Mapi language reference',
      description:
        'Return the Mapi language reference: header lines, box attributes (shapes, col, row, top/bottom, clone, same, at, icon, color, badge…), line syntax and how layout works. Read it before writing or editing a map.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => ({ content: [text(languageReference())] }),
  )
}
