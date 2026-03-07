# @nacho-labs/angular-grab-mcp

> MCP server for angular-grab — query grabbed elements from AI coding agents

This MCP (Model Context Protocol) server lets AI coding agents like Claude Desktop access your angular-grab history. Search grabbed elements, query component context, and get element details directly from your AI assistant.

## Features

- **Search grabbed elements** — Query by text, component name, or file path
- **Get recent grabs** — Fetch the latest grabbed elements
- **View grab details** — Get full context for a specific grab
- **Usage statistics** — See grab counts, unique components, and activity

## Install

```bash
npm install -g @nacho-labs/angular-grab-mcp
```

Or run directly with npx:

```bash
npx @nacho-labs/angular-grab-mcp
```

## Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "angular-grab": {
      "command": "npx",
      "args": ["@nacho-labs/angular-grab-mcp"],
      "env": {
        "ANGULAR_GRAB_HISTORY_PATH": "/path/to/your/.angular-grab/history.json"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANGULAR_GRAB_HISTORY_PATH` | Path to angular-grab history file | `~/.angular-grab/history.json` |

## MCP Tools

### `angular_grab_search`

Search angular-grab history by text, component name, or file path.

**Parameters:**
- `query` (optional): Search term (searches in HTML, component name, file path, selector)
- `componentName` (optional): Filter by component name (partial match)
- `filePath` (optional): Filter by file path (partial match)
- `limit` (optional): Maximum results (default: 10)

**Example:**
```typescript
{
  "query": "button",
  "limit": 5
}
```

**Returns:**
```json
{
  "total": 2,
  "results": [
    {
      "id": "abc123",
      "timestamp": "2024-03-07T12:34:56.789Z",
      "componentName": "SubmitButtonComponent",
      "filePath": "src/app/submit-button.component.ts",
      "lineNumber": 12,
      "selector": "button.submit-btn",
      "html": "<button class=\"submit-btn\">Save</button>",
      "stackTrace": [...]
    }
  ]
}
```

### `angular_grab_recent`

Get the most recent grabbed elements.

**Parameters:**
- `limit` (optional): Number of results (default: 5)

**Example:**
```typescript
{
  "limit": 10
}
```

### `angular_grab_get`

Get a specific grabbed element by ID.

**Parameters:**
- `id` (required): The grab entry ID

**Example:**
```typescript
{
  "id": "abc123"
}
```

### `angular_grab_stats`

Get statistics about your angular-grab history.

**Returns:**
```json
{
  "totalGrabs": 147,
  "uniqueComponents": 42,
  "uniqueFiles": 28,
  "maxEntries": 50,
  "recentActivity": {
    "last24Hours": 12,
    "last7Days": 38
  },
  "mostRecentGrab": "2024-03-07T12:34:56.789Z"
}
```

## How It Works

1. **angular-grab** POSTs grabbed elements to a webhook server (or saves directly via browser extension)
2. **Webhook server** (`angular-grab-webhook`) receives grabs and saves to `~/.angular-grab/history.json`
3. **MCP server** (`angular-grab-mcp`) watches that file and provides query tools
4. **AI agents** can search and retrieve grab history via MCP

## Webhook Server

To receive grabs from angular-grab in the browser, run the webhook server:

```bash
npx @nacho-labs/angular-grab-mcp webhook
```

Or install globally:

```bash
npm install -g @nacho-labs/angular-grab-mcp
angular-grab-webhook
```

The webhook server runs on `http://localhost:3456` by default and saves grabs to `~/.angular-grab/history.json`.

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANGULAR_GRAB_PORT` | Webhook server port | `3456` |
| `ANGULAR_GRAB_HISTORY_PATH` | Path to history file | `~/.angular-grab/history.json` |

### Configuring angular-grab

Add a webhook URL to your angular-grab configuration:

```typescript
import { provideAngularGrab } from '@nacho-labs/angular-grab/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAngularGrab({
      // ... other options
      onGrab: async (context) => {
        await fetch('http://localhost:3456/grab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: context.html,
            componentName: context.componentName || '',
            filePath: context.filePath || '',
            lineNumber: context.line || 0,
            selector: context.selector,
            stackTrace: context.componentStack.map(c => ({
              componentName: c.name || '',
              filePath: c.filePath || '',
              lineNumber: c.line || 0,
            })),
          }),
        });
      },
    }),
  ],
};
```

## Example Usage with Claude

Once configured, you can ask Claude:

- "Show me the last 5 elements I grabbed"
- "Search my angular-grab history for button components"
- "What components have I grabbed from the auth module?"
- "Get the grab with ID abc123"

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
node dist/index.js
```

## License

MIT © Nate Richardson
