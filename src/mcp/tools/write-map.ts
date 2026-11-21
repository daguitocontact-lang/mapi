import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { renderMap } from '../../render-map'
import type { McpContext } from '../context'
import { failure, mapPath, text } from '../context'
import { ProblemList } from './shared'

export function registerWriteMapTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'write_map',
    {
      title: 'Write a map',
      description:
        'Create or overwrite a map with Mapi source text. The map is validated first: by default it is NOT saved when it has errors (pass force=true to save a draft anyway). Returns the validation and the placement text so you can check the result right away. Call get_language_reference first if you are unsure of the syntax.',
      inputSchema: z.object({
        path: z.string().describe('Where to save, relative to the maps folder; must end in .mapi'),
        source: z.string().describe('The full Mapi text of the map'),
        force: z.boolean().optional().describe('Save even if the map has errors'),
      }),
      outputSchema: z.object({ saved: z.boolean(), path: z.string(), errors: ProblemList, crossings: z.number(), placement: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, source, force }) => {
      const p = mapPath(ctx, path)
      if ('error' in p) return failure(p.error)
      const r = await renderMap(source)
      const errors = r.errors.map(({ line, message }) => ({ line, message }))
      const saved = errors.length === 0 || force === true
      if (saved) {
        mkdirSync(dirname(p.abs), { recursive: true })
        writeFileSync(p.abs, source)
      }
      const head = saved ? `saved ${p.rel}` : `NOT saved ${p.rel}: ${errors.length} error(s) — fix them or pass force=true`
      const lines = [head, ...errors.map((e) => `error${e.line ? ` L${e.line}` : ''}: ${e.message}`), r.placement]
      return {
        content: [text(lines.join('\n'))],
        structuredContent: { saved, path: p.rel, errors, crossings: r.placed.crossings, placement: r.placement },
        isError: !saved,
      }
    },
  )
}
