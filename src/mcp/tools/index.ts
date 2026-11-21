import type { McpServer } from '@modelcontextprotocol/server'
import type { McpContext } from '../context'
import { registerGetPlacementTool } from './get-placement'
import { registerLanguageTool } from './language'
import { registerListMapsTool } from './list-maps'
import { registerReadMapTool } from './read-map'
import { registerRenderMapTool } from './render-map'
import { registerValidateMapTool } from './validate-map'
import { registerWriteMapTool } from './write-map'

export function registerTools(server: McpServer, ctx: McpContext): void {
  registerLanguageTool(server)
  registerListMapsTool(server, ctx)
  registerReadMapTool(server, ctx)
  registerWriteMapTool(server, ctx)
  registerValidateMapTool(server, ctx)
  registerGetPlacementTool(server, ctx)
  registerRenderMapTool(server, ctx)
}
