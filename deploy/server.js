#!/usr/bin/env node
/**
 * JuniOS — Production Server
 *
 * Serves the built SPA + provides backend APIs:
 *   - POST /api/auth/login     — Linux PAM authentication
 *   - GET  /api/fs/list        — List directory contents
 *   - GET  /api/fs/read        — Read file contents
 *   - POST /api/fs/mkdir       — Create directory
 *   - POST /api/fs/move        — Move/rename file or directory
 *   - POST /api/fs/delete      — Delete file or directory
 *   - GET  /api/fs/download    — Download a file
 *   - GET  /api/logs           — Request log ring buffer
 *   - GET  /health             — Health check
 *
 * Optionally proxies to Vertex AI backend (server/index.js) if running.
 */

import express from 'express';
import { promises as fsPromises, existsSync, statSync, createReadStream } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const HOME = process.env.HOME || '/home/' + process.env.USER;
const PORT = parseInt(process.env.JUNIOS_PORT || process.env.PORT || '3000', 10);
const VERTEX_BACKEND = process.env.VERTEX_BACKEND || 'http://127.0.0.1:3001';

const app = express();
app.use(express.json({ limit: '20mb' }));

// ─── Request log ring buffer ────────────────────────────────
const MAX_LOGS = 500;
const requestLogs = [];
function addLog(entry) {
  entry.timestamp = new Date().toISOString();
  requestLogs.push(entry);
  if (requestLogs.length > MAX_LOGS) requestLogs.shift();
}

// ─── Health ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'junios', uptime: process.uptime() });
});

// ─── Logs ───────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_LOGS);
  const level = req.query.level;
  const type = req.query.type;
  let filtered = requestLogs;
  if (level) filtered = filtered.filter(l => l.level === level);
  if (type) filtered = filtered.filter(l => l.type === type);
  res.json(filtered.slice(-limit));
});

// ─── Linux Auth ─────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  // Sanitize: only allow alphanumeric + dash + underscore + dot
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('su', ['-c', 'true', username], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Send password after a brief delay for prompt
      setTimeout(() => {
        proc.stdin.write(password + '\n');
        proc.stdin.end();
      }, 100);
      const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 8000);
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(true);
        else reject(new Error('auth failed'));
      });
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    addLog({ level: 'info', type: 'auth', event: 'login', username });
    res.json({ ok: true, username });
  } catch {
    addLog({ level: 'error', type: 'auth', event: 'login_failed', username });
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

// ─── Filesystem API ─────────────────────────────────────────
function resolveAndCheck(p) {
  const resolved = path.resolve(p);
  if (!resolved.startsWith(HOME)) {
    throw Object.assign(new Error('Access denied — path outside home directory'), { status: 403 });
  }
  return resolved;
}

app.get('/api/fs/list', async (req, res) => {
  try {
    const dirPath = resolveAndCheck(req.query.path || HOME);
    const items = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const entries = await Promise.all(items.map(async (item) => {
      const fullPath = path.join(dirPath, item.name);
      try {
        const stat = await fsPromises.stat(fullPath);
        return { name: item.name, path: fullPath, isDirectory: item.isDirectory(), size: stat.size, modifiedAt: stat.mtimeMs };
      } catch {
        return { name: item.name, path: fullPath, isDirectory: item.isDirectory(), size: 0, modifiedAt: 0 };
      }
    }));
    entries.sort((a, b) => (a.isDirectory !== b.isDirectory) ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name));
    res.json({ path: dirPath, entries });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/fs/read', async (req, res) => {
  try {
    const filePath = resolveAndCheck(req.query.path);
    const stat = await fsPromises.stat(filePath);
    if (stat.size > 10 * 1024 * 1024) return res.status(413).json({ error: 'File too large' });
    const content = await fsPromises.readFile(filePath, 'utf-8');
    res.json({ path: filePath, content });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/fs/mkdir', async (req, res) => {
  try {
    const dirPath = resolveAndCheck(req.body.path);
    await fsPromises.mkdir(dirPath, { recursive: true });
    res.json({ ok: true, path: dirPath });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/fs/move', async (req, res) => {
  try {
    const src = resolveAndCheck(req.body.src);
    const dest = resolveAndCheck(req.body.dest);
    await fsPromises.rename(src, dest);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/fs/delete', async (req, res) => {
  try {
    const target = resolveAndCheck(req.body.path);
    const stat = await fsPromises.stat(target);
    if (stat.isDirectory()) await fsPromises.rm(target, { recursive: true });
    else await fsPromises.unlink(target);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/fs/download', (req, res) => {
  try {
    const filePath = resolveAndCheck(req.query.path);
    res.download(filePath);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─── Proxy: Vertex AI backend (optional) ────────────────────
for (const route of ['/api/gemini', '/api/stocks', '/api/news']) {
  app.use(route, (req, res) => {
    const url = `${VERTEX_BACKEND}${req.originalUrl}`;
    const proxyReq = http.request(url, {
      method: req.method,
      headers: { ...req.headers, host: new URL(VERTEX_BACKEND).host },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.status(502).json({ error: 'Backend service unavailable' });
    });
    req.pipe(proxyReq);
  });
}

// ─── SPA static files ───────────────────────────────────────
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback — serve index.html for client-side routes
  app.get('{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ error: 'dist/ not found — run: npm run build' });
  });
}

// ─── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  addLog({ level: 'error', event: 'server_error', error: err.message });
  res.status(400).json({ error: err.message });
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`JuniOS server running on http://0.0.0.0:${PORT}`);
  console.log(`  Home directory: ${HOME}`);
  console.log(`  SPA: ${existsSync(DIST_DIR) ? DIST_DIR : '(not built — run npm run build)'}`);
  console.log(`  Vertex AI backend: ${VERTEX_BACKEND}`);
});
