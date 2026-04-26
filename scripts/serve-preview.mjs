#!/usr/bin/env node
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const port = Number(process.argv[3] ?? process.argv[2] ?? 4173);
const defaultPath = '/generated/figma-preview/index.html';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname === '/' ? defaultPath : url.pathname);
  const filePath = safeJoin(cwd, pathname);
  if (!filePath) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Not found: ${pathname}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Figma preview: http://127.0.0.1:${port}/`);
});

function safeJoin(root, pathname) {
  const normalized = path.normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = path.join(root, normalized);
  return filePath.startsWith(root) ? filePath : null;
}
