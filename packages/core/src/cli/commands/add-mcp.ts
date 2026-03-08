import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const MCP_PACKAGE = '@nacho-labs/angular-grab-mcp';
const MCP_SERVER_NAME = 'angular-grab';

function log(msg: string): void {
  console.log(`\x1b[36m[angular-grab]\x1b[0m ${msg}`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m[angular-grab]\x1b[0m ${msg}`);
}

function success(msg: string): void {
  console.log(`\x1b[32m[angular-grab]\x1b[0m ${msg}`);
}

function getMcpServerEntry(): { type: string; command: string; args: string[] } {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    return {
      type: 'stdio',
      command: 'cmd',
      args: ['/c', 'npx', '-y', `${MCP_PACKAGE}@latest`],
    };
  }
  return {
    type: 'stdio',
    command: 'npx',
    args: ['-y', `${MCP_PACKAGE}@latest`],
  };
}

export async function addMcp(): Promise<void> {
  log('Adding angular-grab MCP server...\n');

  const mcpJsonPath = join(process.cwd(), '.mcp.json');
  let config: Record<string, unknown> = {};

  if (existsSync(mcpJsonPath)) {
    try {
      config = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
    } catch {
      warn('.mcp.json exists but could not be parsed, overwriting...');
    }
  }

  const servers = (config.mcpServers as Record<string, unknown>) ?? {};
  servers[MCP_SERVER_NAME] = getMcpServerEntry();
  config.mcpServers = servers;

  writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n');
  success('Added angular-grab MCP server to .mcp.json');

  console.log('');
  console.log('  The MCP server gives your AI coding agent access to');
  console.log('  elements you grab from the browser.');
  console.log('');
  console.log('  \x1b[1mRestart your editor\x1b[0m to activate the MCP connection.');
  console.log('  When prompted, \x1b[1mapprove the MCP server\x1b[0m in your editor.');
  console.log('');
}
