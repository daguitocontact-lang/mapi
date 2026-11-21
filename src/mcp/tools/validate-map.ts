import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { renderMap } from '../../render-map'
import type { McpContext } from '../context'
import { failure, text } from '../context'
import { MapInput, ProblemList, sourceOf } from './shared'

export function registerValidateMapTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'validate_map',
    {
      title: 'Validate a map',
      description:
        'Check a map for problems: syntax errors, lines pointing at unknown boxes, and anything drawn on top of anything (boxes, lines, labels, titles) — a hard error in Mapi. Also returns readability warnings and the crossing count. Use it after every edit; fix errors until "ok" is true.',
      inputSchema: MapInput,
      outputSchema: z.object({ ok: z.boolean(), errors: ProblemList, warnings: ProblemList, crossings: z.number() }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const src = sourceOf(ctx, input)
      if ('error' in src) return failure(src.error)
      const r = await renderMap(src.source, { focus: input.focus, context: input.context })
      const strip = (list: typeof r.errors) => list.map(({ line, message }) => ({ line, message }))
      const ok = r.errors.length === 0
      const lines = [
        `${src.label}: ${ok ? 'ok' : `${r.errors.length} error(s)`} · ${r.placed.crossings} crossing(s)`,
        ...r.errors.map((e) => `error${e.line ? ` L${e.line}` : ''}: ${e.message}`),
        ...r.warnings.map((e) => `warning${e.line ? ` L${e.line}` : ''}: ${e.message}`),
      ]
      return {
        content: [text(lines.join('\n'))],
        structuredContent: { ok, errors: strip(r.errors), warnings: strip(r.warnings), crossings: r.placed.crossings },
      }
    },
  )
}
