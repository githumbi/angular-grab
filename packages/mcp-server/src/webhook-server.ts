import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

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

const DEFAULT_PORT = 3456;
const DEFAULT_HISTORY_PATH = join(homedir(), '.angular-grab', 'history.json');

const port = parseInt(process.env.ANGULAR_GRAB_PORT || String(DEFAULT_PORT));
const historyPath = process.env.ANGULAR_GRAB_HISTORY_PATH || DEFAULT_HISTORY_PATH;

async function ensureHistoryFile(): Promise<void> {
  try {
    await mkdir(join(historyPath, '..'), { recursive: true });
    try {
      await readFile(historyPath);
    } catch {
      const initial: GrabHistory = { entries: [], maxEntries: 50 };
      await writeFile(historyPath, JSON.stringify(initial, null, 2));
    }
  } catch (error) {
    console.error('Failed to ensure history file:', error);
    process.exit(1);
  }
}

async function readHistory(): Promise<GrabHistory> {
  try {
    const content = await readFile(historyPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { entries: [], maxEntries: 50 };
  }
}

async function addGrab(entry: Omit<GrabEntry, 'id' | 'timestamp'>): Promise<void> {
  const history = await readHistory();
  
  const newEntry: GrabEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
  };
  
  history.entries = [newEntry, ...history.entries].slice(0, history.maxEntries);
  
  await writeFile(historyPath, JSON.stringify(history, null, 2));
}

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  if (req.url !== '/grab') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      
      // Validate required fields
      if (!data.html || !data.componentName || !data.filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: html, componentName, filePath' }));
        return;
      }
      
      await addGrab({
        html: data.html,
        componentName: data.componentName,
        filePath: data.filePath,
        lineNumber: data.lineNumber || 0,
        selector: data.selector || '',
        stackTrace: data.stackTrace || [],
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      
      console.log(`Grabbed: ${data.componentName} at ${data.filePath}:${data.lineNumber}`);
    } catch (error) {
      console.error('Failed to process grab:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
});

async function main() {
  await ensureHistoryFile();
  
  server.listen(port, () => {
    console.log(`angular-grab webhook server running on http://localhost:${port}`);
    console.log(`Saving grabs to: ${historyPath}`);
    console.log('');
    console.log('Configure angular-grab to POST to: http://localhost:${port}/grab');
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
