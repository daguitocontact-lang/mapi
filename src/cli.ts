import { DEFAULT_PORT, startDevServer } from './dev-server'
import { serveMcp } from './mcp/stdio'
import { VERSION } from './version'

const [command, dir = '.', port] = process.argv.slice(2)

switch (command) {
  case 'dev':
    startDevServer(dir, port ? Number(port) : DEFAULT_PORT)
    break
  case 'mcp':
    serveMcp(dir)
    break
  case '--version':
  case '-v':
    process.stdout.write(`${VERSION}\n`)
    break
  default:
    process.stderr.write('usage:\n  mapi dev [dir] [port]   viewer with live reload\n  mapi mcp [dir]          MCP server over stdio for the maps in dir\n')
    process.exit(1)
}
