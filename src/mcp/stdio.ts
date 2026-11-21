import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createServer } from './server'

/** `mapi mcp [dir]`: serve the maps in `dir` (default: the working directory) over stdio. */
export function serveMcp(root: string): void {
  serveStdio(() => createServer(root))
}
