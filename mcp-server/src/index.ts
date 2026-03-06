import 'dotenv/config';
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

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'gmat-coach',
    version: '1.0.0',
  });

  const supabase = getSupabase();

  // Register all tool groups
  registerPerformanceTools(server, supabase);
  registerTopicsTools(server, supabase);
  registerAnswersTools(server, supabase);
  registerSimulationTools(server, supabase);
  registerAdvancedTools(server, supabase);
  registerRecommendTools(server, supabase);
  registerWriteTools(server, supabase);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  process.stderr.write('GMAT Coach MCP server started. 13 tools ready.\n');
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
