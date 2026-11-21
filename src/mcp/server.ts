import { McpServer } from '@modelcontextprotocol/server'
import { resolve } from 'node:path'
import { VERSION } from '../version'
import { languageReference } from './context'
import { registerTools } from './tools'

/**
 * The Mapi MCP server over a folder of .mapi maps. Built without I/O at import time so
 * tests can link it to an in-memory client; `mapi mcp` serves it over stdio.
 */
export function createServer(root: string): McpServer {
  const server = new McpServer({ name: 'mapi', version: VERSION })
  const ctx = { root: resolve(root) }
  registerTools(server, ctx)
  server.registerResource(
    'language',
    'mapi://language',
    { title: 'Mapi language reference', description: 'How to write a .mapi map', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: languageReference() }] }),
  )
  return server
}
