import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createIntegrations } from './integrations/index.js';

export const SERVER_NAME = 'umd-mcp';
export const SERVER_VERSION = '0.1.0';

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const integration of createIntegrations()) {
    integration.register(server);
  }

  return server;
}
