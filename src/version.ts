import pkg from '../package.json'

/** Single source of truth for the version reported by the CLI and the MCP server. */
export const VERSION: string = pkg.version
