#!/usr/bin/env node
import http from 'node:http';
import { buildFrontendToFigmaPayload } from './frontend-to-figma-payload.mjs';

const port = Number(process.env.FRONTEND_TO_FIGMA_PORT || process.argv[2] || 4760);
const cwd = process.cwd();

const server = http.createServer(async (request, response) => {
  setCors(response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, name: 'frontend-to-figma-bridge', cwd });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/payload') {
      const payload = await buildFrontendToFigmaPayload({ cwd, includeImages: url.searchParams.get('images') !== 'false' });
      sendJson(response, 200, payload);
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Frontend-to-Figma bridge listening at http://localhost:${port}`);
});

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}
