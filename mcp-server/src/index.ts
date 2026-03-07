import dotenv from 'dotenv';

// Load .env with absolute path (works regardless of working directory)
dotenv.config({ path: (process.env.HOME ?? '') + '/gmat-web/mcp-server/.env' });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getSupabase } from './supabase.js';
import { registerPerformanceTools } from './tools/performance.js';
import { registerTopicsTools } from './tools/topics.js';
import { registerAnswersTools } from './tools/answers.js';
import { registerSimulationTools } from './tools/simulation.js';
import { registerAdvancedTools } from './tools/advanced.js';
import { registerRecommendTools } from './tools/recommend.js';
import { registerWriteTools } from './tools/write.js';
import { registerDIWriteTools } from './tools/di-write.js';
import { registerCrudTools } from './tools/crud.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'gmat-coach',
    version: '1.0.0',
  });

  const supabase = getSupabase();

  registerPerformanceTools(server, supabase);
  registerTopicsTools(server, supabase);
  registerAnswersTools(server, supabase);
  registerSimulationTools(server, supabase);
  registerAdvancedTools(server, supabase);
  registerRecommendTools(server, supabase);
  registerWriteTools(server, supabase);
  registerDIWriteTools(server, supabase);
  registerCrudTools(server, supabase);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('GMAT Coach MCP server started. 24 tools ready.\n');
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
