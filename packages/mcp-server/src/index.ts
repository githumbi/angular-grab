import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { GrabEntry, GrabHistory } from './types.js';

const DEFAULT_HISTORY_PATH = join(homedir(), '.angular-grab', 'history.json');
const DEFAULT_WEBHOOK_PORT = 3456;
const DEFAULT_WEBHOOK_HOST = '127.0.0.1';

// Payload caps — defence against oversized / adversarial grabs that would flow
// into the agent's context window as indirect prompt-injection material.
const MAX_HTML_LEN = 100_000;
const MAX_SNIPPET_LEN = 200_000;
const MAX_STRING_LEN = 2_000;
const MAX_STACK_DEPTH = 64;
const MAX_CSS_CLASSES = 128;

// Rate limit per remote IP (token bucket, reset every 60s)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateBuckets = new Map<string, { count: number; reset: number }>();

let historyPath = DEFAULT_HISTORY_PATH;
let cachedHistory: GrabHistory | null = null;

function isLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

function sanitizeForLog(value: unknown): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  // Strip control chars (including newline / ANSI escape intro) to prevent log-injection
  return s.replace(/[\x00-\x1f\x7f]/g, '?').slice(0, 200);
}

function truncateString(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.length > max ? v.slice(0, max) : v;
}

function nullableString(v: unknown, max: number): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  return v.length > max ? v.slice(0, max) : v;
}

function safeInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return null;
  if (v < 0 || v > 1_000_000_000) return null;
  return v;
}

async function ensureHistoryFile(): Promise<void> {
  try {
    const exists = await stat(historyPath).catch(() => null);
    if (!exists) {
      await mkdir(dirname(historyPath), { recursive: true });
      const initial: GrabHistory = { entries: [], maxEntries: 50 };
      await writeFile(historyPath, JSON.stringify(initial, null, 2));
    }
  } catch (error) {
    console.error('Failed to ensure history file:', error);
  }
}

async function readHistory(): Promise<GrabHistory> {
  if (cachedHistory) {
    return cachedHistory;
  }

  try {
    const content = await readFile(historyPath, 'utf-8');
    const data = JSON.parse(content) as GrabHistory;
    cachedHistory = data;
    return data;
  } catch {
    return { entries: [], maxEntries: 50 };
  }
}

// Serialize writes to prevent concurrent read-modify-write data loss
let writeQueue: Promise<void> = Promise.resolve();

async function addGrab(context: GrabEntry['context'], snippet: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    // Always read fresh from disk inside the serialized queue
    cachedHistory = null;
    const history = await readHistory();

    const newEntry: GrabEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      context,
      snippet,
      timestamp: Date.now(),
    };

    history.entries = [newEntry, ...history.entries].slice(0, history.maxEntries);
    await writeFile(historyPath, JSON.stringify(history, null, 2));
    cachedHistory = history;
  });
  await writeQueue;
}

function searchHistory(
  history: GrabHistory,
  query?: string,
  componentName?: string,
  filePath?: string,
  limit = 10
): GrabEntry[] {
  let results = [...history.entries];

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (entry) =>
        entry.context.html.toLowerCase().includes(q) ||
        (entry.context.componentName?.toLowerCase().includes(q) ?? false) ||
        (entry.context.filePath?.toLowerCase().includes(q) ?? false) ||
        entry.context.selector.toLowerCase().includes(q)
    );
  }

  if (componentName) {
    const cn = componentName.toLowerCase();
    results = results.filter((entry) =>
      entry.context.componentName?.toLowerCase().includes(cn) ?? false
    );
  }

  if (filePath) {
    const fp = filePath.toLowerCase();
    results = results.filter((entry) =>
      entry.context.filePath?.toLowerCase().includes(fp) ?? false
    );
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results.slice(0, Math.max(0, limit));
}

function formatEntry(entry: GrabEntry) {
  return {
    id: entry.id,
    timestamp: new Date(entry.timestamp).toISOString(),
    snippet: entry.snippet,
    context: {
      componentName: entry.context.componentName,
      filePath: entry.context.filePath,
      line: entry.context.line,
      column: entry.context.column,
      selector: entry.context.selector,
      cssClasses: entry.context.cssClasses,
      html: entry.context.html,
      componentStack: entry.context.componentStack,
    },
  };
}

// ── HTTP server (receives grabs from browser) ──

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}

function startWebhookServer(port: number, host: string): void {
  const httpServer = createServer(async (req, res) => {
    const origin = req.headers.origin as string | undefined;
    // Only echo CORS back to loopback origins — blocks arbitrary websites from
    // posting grabs while the browser is making the request.
    if (isLoopbackOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(isLoopbackOrigin(origin) ? 204 : 403);
      res.end();
      return;
    }

    if (req.method !== 'POST' || req.url !== '/grab') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Block non-loopback origins (when set). Requests without an Origin header
    // are allowed because non-browser clients (curl, extensions sending grabs
    // from the same page without a cross-origin request) do not set one.
    if (origin !== undefined && !isLoopbackOrigin(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }

    // Only accept JSON bodies — rejects text/plain simple-CORS abuse vectors.
    const ct = (req.headers['content-type'] || '').toString().toLowerCase();
    if (!ct.startsWith('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unsupported Media Type' }));
      return;
    }

    const ip = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    const MAX_BODY = 1024 * 512; // 512 KB
    let body = '';
    let overflow = false;

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > MAX_BODY) {
        overflow = true;
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (overflow) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      try {
        const data = JSON.parse(body);

        if (typeof data !== 'object' || data === null) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Body must be a JSON object' }));
          return;
        }

        if (typeof data.html !== 'string' || typeof data.componentName !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields: html, componentName' }));
          return;
        }

        const rawClasses = Array.isArray(data.cssClasses) ? data.cssClasses : [];
        const rawStack = Array.isArray(data.componentStack) ? data.componentStack : [];

        const context: GrabEntry['context'] = {
          html: truncateString(data.html, MAX_HTML_LEN),
          componentName: truncateString(data.componentName, MAX_STRING_LEN),
          filePath: nullableString(data.filePath, MAX_STRING_LEN),
          line: safeInt(data.line),
          column: safeInt(data.column),
          selector: truncateString(data.selector, MAX_STRING_LEN),
          cssClasses: rawClasses
            .slice(0, MAX_CSS_CLASSES)
            .map((c: unknown) => truncateString(c, MAX_STRING_LEN))
            .filter((c: string) => c.length > 0),
          componentStack: rawStack
            .slice(0, MAX_STACK_DEPTH)
            .map((entry: unknown) => {
              const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
              return {
                name: truncateString(e.name, MAX_STRING_LEN),
                filePath: nullableString(e.filePath, MAX_STRING_LEN),
                line: safeInt(e.line),
                column: safeInt(e.column),
              };
            }),
        };

        const snippet = truncateString(data.snippet, MAX_SNIPPET_LEN);
        await addGrab(context, snippet);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

        console.error(
          `Grabbed: ${sanitizeForLog(context.componentName)} at ${sanitizeForLog(context.filePath ?? 'unknown')}:${context.line ?? '?'}`,
        );
      } catch (error) {
        console.error('Failed to process grab:', sanitizeForLog(error instanceof Error ? error.message : 'unknown error'));
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[angular-grab] Port ${port} already in use. Webhook disabled — MCP tools still work, but new grabs won't be received.`
      );
      console.error(
        `[angular-grab] To use a different port, set ANGULAR_GRAB_PORT env variable.`
      );
    } else {
      console.error(`[angular-grab] Webhook server error:`, err);
    }
  });

  httpServer.listen(port, host, () => {
    console.error(`Webhook listener on http://${host}:${port}/grab`);
  });
}

// ── MCP server (responds to agent queries via stdio) ──

const mcpServer = new Server(
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

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'angular_grab_search',
      description:
        'Search angular-grab history. Query grabbed Angular elements by text, component name, or file path. Returns matching elements with HTML, component info, and stack trace.',
      inputSchema: {
        type: 'object' as const,
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
        type: 'object' as const,
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
        type: 'object' as const,
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
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
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
                { total: results.length, results: results.map(formatEntry) },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'angular_grab_recent': {
        const { limit = 5 } = args as { limit?: number };
        const recent = searchHistory(history, undefined, undefined, undefined, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { total: recent.length, results: recent.map(formatEntry) },
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
              text: JSON.stringify(formatEntry(entry), null, 2),
            },
          ],
        };
      }

      case 'angular_grab_stats': {
        const uniqueComponents = new Set(
          history.entries.map((e) => e.context.componentName).filter(Boolean)
        );
        const uniqueFiles = new Set(
          history.entries.map((e) => e.context.filePath).filter(Boolean)
        );

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

// ── Main ──

async function main() {
  if (process.env.ANGULAR_GRAB_HISTORY_PATH) {
    historyPath = process.env.ANGULAR_GRAB_HISTORY_PATH;
  }

  const webhookPort = parseInt(
    process.env.ANGULAR_GRAB_PORT || String(DEFAULT_WEBHOOK_PORT),
    10,
  );

  // Bind to loopback by default so arbitrary LAN hosts can't POST grabs.
  // Containerized deployments opt in with ANGULAR_GRAB_HOST=0.0.0.0.
  const webhookHost = process.env.ANGULAR_GRAB_HOST || DEFAULT_WEBHOOK_HOST;

  await ensureHistoryFile();

  // Start HTTP listener for incoming grabs from the browser
  startWebhookServer(webhookPort, webhookHost);

  // Start MCP stdio transport for agent queries
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error('angular-grab MCP server running');
  console.error(`History: ${historyPath}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
