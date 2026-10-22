#!/usr/bin/env node
/** Tiny static file server for previewing ./site locally: `npm run serve` → http://localhost:8080 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = +(process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

http
  .createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, urlPath);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 – nie znaleziono');
    }
  })
  .listen(PORT, () => console.log(`Podgląd strony: http://localhost:${PORT}`));
