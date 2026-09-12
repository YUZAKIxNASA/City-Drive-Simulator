/**
 * Tiny zero-dependency static file server.
 * Hostinger Node.js hosting runs `npm start`, which runs this file.
 * It serves the production build from ./dist
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
};

function safeJoin(root, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const full = join(root, clean);
  return full.startsWith(root) ? full : root;
}

const server = createServer(async (req, res) => {
  try {
    if (!existsSync(ROOT)) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Build not found. Run "npm run build" first.');
      return;
    }

    const url = (req.url || '/').split('?')[0];
    let filePath = safeJoin(ROOT, url === '/' ? '/index.html' : url);

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    // Single page app fallback.
    if (!existsSync(filePath)) filePath = join(ROOT, 'index.html');

    const ext = extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };

    // Hashed asset files can be cached hard, index.html must not be.
    headers['Cache-Control'] = filePath.includes(`${'/'}assets${'/'}`) || filePath.includes('\\assets\\')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

    res.writeHead(200, headers);
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`City Drive Simulator running on http://${HOST}:${PORT}`);
});
