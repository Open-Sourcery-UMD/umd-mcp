#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol; log to stderr only.
  console.error('umd-mcp server running on stdio');
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
