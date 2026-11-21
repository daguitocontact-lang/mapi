import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveMapPath } from '../library'

/** What every tool shares: the folder of maps it may read and write. */
export type McpContext = { root: string }

/** A map path inside the root, or an error message the model can act on. */
export function mapPath(ctx: McpContext, requested: string): { abs: string; rel: string } | { error: string } {
  const rel = resolveMapPath(ctx.root, requested)
  if (!rel) return { error: `"${requested}" is not a .mapi path inside the maps folder (use list_maps to see them)` }
  return { abs: join(ctx.root, rel), rel }
}

/** Read a map by path; tools that also accept inline `source` call this only when it is absent. */
export function readMap(ctx: McpContext, requested: string): { source: string; rel: string } | { error: string } {
  const p = mapPath(ctx, requested)
  if ('error' in p) return p
  if (!existsSync(p.abs)) return { error: `no map at "${p.rel}" (use list_maps to see them)` }
  return { source: readFileSync(p.abs, 'utf8'), rel: p.rel }
}

/** The language reference = the README's "The language" + "How layout works" sections. */
export function languageReference(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // dist/cli.js → ../README.md · src/mcp/*.ts → ../../README.md
  const readme = [join(here, '..', 'README.md'), join(here, '..', '..', 'README.md')].find((p) => existsSync(p))
  if (!readme) return 'Mapi language reference not found in this install (README.md is missing).'
  const text = readFileSync(readme, 'utf8')
  const start = text.indexOf('## A map in 10 lines')
  const end = text.indexOf('## License')
  return text.slice(start >= 0 ? start : 0, end >= 0 ? end : undefined).trim()
}

export const text = (value: string) => ({ type: 'text' as const, text: value })
export const failure = (message: string) => ({ content: [text(message)], isError: true })
