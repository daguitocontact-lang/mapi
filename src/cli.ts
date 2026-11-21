import { DEFAULT_PORT, startDevServer } from './dev-server'

const [command, dir = '.', port] = process.argv.slice(2)

switch (command) {
  case 'dev':
    startDevServer(dir, port ? Number(port) : DEFAULT_PORT)
    break
  default:
    process.stderr.write('usage: mapi dev [dir] [port]\n')
    process.exit(1)
}
