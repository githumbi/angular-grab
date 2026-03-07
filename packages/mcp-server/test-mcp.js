#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

const server = spawn('./dist/index.js', [], {
  stdio: ['pipe', 'pipe', 'inherit'],
  cwd: process.cwd(),
});

let responseBuffer = '';
let requestId = 1;

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = JSON.parse(line);
      console.log('Response:', JSON.stringify(response, null, 2));
    } catch (e) {
      console.log('Non-JSON output:', line);
    }
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params,
  };
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Wait for server to start
setTimeout(() => {
  console.log('Testing MCP server...\n');
  
  // Test 1: Initialize
  console.log('1. Initialize');
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  });
  
  setTimeout(() => {
    // Test 2: List tools
    console.log('\n2. List tools');
    sendRequest('tools/list');
    
    setTimeout(() => {
      // Test 3: Get recent grabs
      console.log('\n3. Get recent grabs');
      sendRequest('tools/call', {
        name: 'angular_grab_recent',
        arguments: { limit: 2 },
      });
      
      setTimeout(() => {
        // Test 4: Search
        console.log('\n4. Search for "button"');
        sendRequest('tools/call', {
          name: 'angular_grab_search',
          arguments: { query: 'button', limit: 5 },
        });
        
        setTimeout(() => {
          // Test 5: Stats
          console.log('\n5. Get stats');
          sendRequest('tools/call', {
            name: 'angular_grab_stats',
            arguments: {},
          });
          
          setTimeout(() => {
            console.log('\n✅ Tests complete');
            server.kill();
            process.exit(0);
          }, 500);
        }, 500);
      }, 500);
    }, 500);
  }, 500);
}, 1000);
