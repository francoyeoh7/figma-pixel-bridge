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
  '.mp4': 'video/mp4',
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
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Accept-Ranges': 'bytes',
    };
    const range = request.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, headers).end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : fileStat.size - 1;
      if (start >= fileStat.size || end >= fileStat.size || start > end) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${fileStat.size}` }).end();
        return;
      }
      response.writeHead(206, {
        ...headers,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
      });
      createReadStream(filePath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, { ...headers, 'Content-Length': String(fileStat.size) });
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
