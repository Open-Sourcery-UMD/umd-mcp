import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRequire } from 'node:module';
import { createIntegrations } from './integrations/index.js';

const { name: SERVER_NAME, version: SERVER_VERSION } = createRequire(import.meta.url)(
  '../package.json',
) as { name: string; version: string };

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const integration of createIntegrations()) {
    integration.register(server);
  }

  return server;
}
