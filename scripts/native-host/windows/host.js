#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ALLOWED_COMMAND = 'npm run server';

function writeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buffer.length, 0);
  process.stdout.write(header);
  process.stdout.write(buffer);
}

function readStdin(onMessage) {
  let pending = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const messageLength = pending.readUInt32LE(0);
      if (pending.length < 4 + messageLength) {
        return;
      }
      const raw = pending.slice(4, 4 + messageLength).toString('utf8');
      pending = pending.slice(4 + messageLength);
      try {
        const parsed = JSON.parse(raw);
        onMessage(parsed);
      } catch {
        writeMessage({ success: false, message: 'Invalid JSON payload' });
      }
    }
  });
}

function resolveCwd(requestedCwd) {
  if (typeof requestedCwd === 'string' && requestedCwd.trim()) {
    return path.resolve(requestedCwd);
  }
  if (process.env.AI_PROXY_PROJECT_DIR && process.env.AI_PROXY_PROJECT_DIR.trim()) {
    return path.resolve(process.env.AI_PROXY_PROJECT_DIR);
  }
  return process.cwd();
}

function launchServer(command, cwd) {
  if (command !== ALLOWED_COMMAND) {
    return { success: false, message: 'Command denied by native host policy' };
  }

  if (!fs.existsSync(cwd)) {
    return { success: false, message: `Working directory not found: ${cwd}` };
  }

  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  child.unref();
  return { success: true, message: `Started "${command}" in ${cwd}` };
}

readStdin((message) => {
  if (!message || message.action !== 'start_server') {
    writeMessage({ success: false, message: 'Unsupported action' });
    return;
  }

  const cwd = resolveCwd(message.cwd);
  const result = launchServer(String(message.command || ''), cwd);
  writeMessage(result);
});
