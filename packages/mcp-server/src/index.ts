import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { watch } from 'chokidar';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface GrabEntry {
  id: string;
  timestamp: number;
  html: string;
  componentName: string;
  filePath: string;
  lineNumber: number;
  stackTrace: Array<{
    componentName: string;
    filePath: string;
    lineNumber: number;
  }>;
  selector: string;
}

interface GrabHistory {
  entries: GrabEntry[];
  maxEntries: number;
}

// Default history file location
const DEFAULT_HISTORY_PATH = join(homedir(), '.angular-grab', 'history.json');

let historyPath = DEFAULT_HISTORY_PATH;
let cachedHistory: GrabHistory | null = null;
let watcher: ReturnType<typeof watch> | null = null;

// Read and parse grab history
async function readHistory(): Promise<GrabHistory> {
  try {
    const exists = await stat(historyPath).catch(() => null);
    if (!exists) {
      return { entries: [], maxEntries: 50 };
    }

    const content = await readFile(historyPath, 'utf-8');
    const data = JSON.parse(content);
    cachedHistory = data;
    return data;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to read grab history: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Search grab history
function searchHistory(
  history: GrabHistory,
  query?: string,
  componentName?: string,
  filePath?: string,
  limit = 10
): GrabEntry[] {
  let results = [...history.entries];

  // Filter by query (searches in HTML, component name, file path)
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (entry) =>
        entry.html.toLowerCase().includes(q) ||
        entry.componentName.toLowerCase().includes(q) ||
        entry.filePath.toLowerCase().includes(q) ||
        entry.selector.toLowerCase().includes(q)
    );
  }

  // Filter by component name
  if (componentName) {
    const cn = componentName.toLowerCase();
    results = results.filter((entry) =>
      entry.componentName.toLowerCase().includes(cn)
    );
  }

  // Filter by file path
  if (filePath) {
    const fp = filePath.toLowerCase();
    results = results.filter((entry) =>
      entry.filePath.toLowerCase().includes(fp)
    );
  }

  // Sort by timestamp (newest first)
  results.sort((a, b) => b.timestamp - a.timestamp);

  // Limit results
  return results.slice(0, limit);
}

// MCP Server
const server = new Server(
  {
    name: 'angular-grab-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'angular_grab_search',
      description:
        'Search angular-grab history. Query grabbed Angular elements by text, component name, or file path. Returns matching elements with HTML, component info, and stack trace.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search term (searches in HTML, component name, file path, selector)',
          },
          componentName: {
            type: 'string',
            description: 'Filter by component name (partial match)',
          },
          filePath: {
            type: 'string',
            description: 'Filter by file path (partial match)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10)',
            default: 10,
          },
        },
      },
    },
    {
      name: 'angular_grab_recent',
      description:
        'Get the most recent grabbed elements. Returns the latest N grabbed elements from angular-grab history.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent grabs to return (default: 5)',
            default: 5,
          },
        },
      },
    },
    {
      name: 'angular_grab_get',
      description:
        'Get a specific grabbed element by ID. Returns the full context for a single grab entry.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The grab entry ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'angular_grab_stats',
      description:
        'Get statistics about angular-grab history. Returns total grabs, unique components, unique files, and recent activity.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const history = await readHistory();

    switch (name) {
      case 'angular_grab_search': {
        const { query, componentName, filePath, limit = 10 } = args as {
          query?: string;
          componentName?: string;
          filePath?: string;
          limit?: number;
        };

        const results = searchHistory(
          history,
          query,
          componentName,
          filePath,
          limit
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total: results.length,
                  results: results.map((entry) => ({
                    id: entry.id,
                    timestamp: new Date(entry.timestamp).toISOString(),
                    componentName: entry.componentName,
                    filePath: entry.filePath,
                    lineNumber: entry.lineNumber,
                    selector: entry.selector,
                    html: entry.html,
                    stackTrace: entry.stackTrace,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'angular_grab_recent': {
        const { limit = 5 } = args as { limit?: number };
        const recent = history.entries.slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total: recent.length,
                  results: recent.map((entry) => ({
                    id: entry.id,
                    timestamp: new Date(entry.timestamp).toISOString(),
                    componentName: entry.componentName,
                    filePath: entry.filePath,
                    lineNumber: entry.lineNumber,
                    selector: entry.selector,
                    html: entry.html,
                    stackTrace: entry.stackTrace,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'angular_grab_get': {
        const { id } = args as { id: string };
        const entry = history.entries.find((e) => e.id === id);

        if (!entry) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Grab entry with ID "${id}" not found`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: entry.id,
                  timestamp: new Date(entry.timestamp).toISOString(),
                  componentName: entry.componentName,
                  filePath: entry.filePath,
                  lineNumber: entry.lineNumber,
                  selector: entry.selector,
                  html: entry.html,
                  stackTrace: entry.stackTrace,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'angular_grab_stats': {
        const uniqueComponents = new Set(
          history.entries.map((e) => e.componentName)
        );
        const uniqueFiles = new Set(history.entries.map((e) => e.filePath));

        const now = Date.now();
        const last24h = history.entries.filter(
          (e) => now - e.timestamp < 24 * 60 * 60 * 1000
        ).length;
        const last7d = history.entries.filter(
          (e) => now - e.timestamp < 7 * 24 * 60 * 60 * 1000
        ).length;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalGrabs: history.entries.length,
                  uniqueComponents: uniqueComponents.size,
                  uniqueFiles: uniqueFiles.size,
                  maxEntries: history.maxEntries,
                  recentActivity: {
                    last24Hours: last24h,
                    last7Days: last7d,
                  },
                  mostRecentGrab: history.entries[0]
                    ? new Date(history.entries[0].timestamp).toISOString()
                    : null,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

// Start the server
async function main() {
  // Check for custom history path via env var
  if (process.env.ANGULAR_GRAB_HISTORY_PATH) {
    historyPath = process.env.ANGULAR_GRAB_HISTORY_PATH;
  }

  // Watch history file for changes
  watcher = watch(historyPath, {
    ignoreInitial: true,
  });

  watcher.on('change', async () => {
    try {
      await readHistory();
    } catch (error) {
      console.error('Failed to reload history:', error);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('angular-grab MCP server running on stdio');
  console.error(`Watching history at: ${historyPath}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
