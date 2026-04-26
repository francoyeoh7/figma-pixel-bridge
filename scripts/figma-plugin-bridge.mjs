#!/usr/bin/env node
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generatePreviewHtml } from './figma-tools/preview-generator.mjs';
import {
  detectImageExtension,
  normalizePluginPayloadToManifest,
  sanitizeFileName,
  writePluginArtifact,
} from './figma-tools/plugin-payload.mjs';

const cwd = process.cwd();
const port = Number(process.env.FIGMA_PLUGIN_BRIDGE_PORT || process.argv[2] || 4758);
const assetsDir = path.join(cwd, 'public', 'figma-assets');
const previewDir = path.join(cwd, 'generated', 'figma-preview');
const cacheDir = path.join(cwd, '.figma-cache', 'plugin-bridge');
const sessions = new Map();

const server = http.createServer(async (request, response) => {
  try {
    setCors(response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, name: 'figma-plugin-bridge', assetsDir, previewDir });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/ingest') {
      const body = await readJsonBody(request);
      const result = await ingest(body);
      sendJson(response, 200, result);
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Figma plugin bridge listening at http://localhost:${port}`);
  console.log(`Assets: ${assetsDir}`);
});

async function ingest(payload) {
  if (!payload?.sessionId) throw new Error('sessionId is required');
  const session = ensureSession(payload.sessionId);
  if (payload.kind === 'complete') {
    const manifestPath = session.rawManifestPath;
    const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
    raw.artifacts = session.artifacts;
    const manifest = normalizePluginPayloadToManifest(raw);
    await mkdir(assetsDir, { recursive: true });
    await mkdir(previewDir, { recursive: true });
    await writeFile(path.join(assetsDir, 'design-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(path.join(previewDir, 'design-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(path.join(previewDir, 'index.html'), generatePreviewHtml(manifest), 'utf8');
    const summary = {
      sessionId: payload.sessionId,
      manifestPath: path.join(assetsDir, 'design-manifest.json'),
      previewPath: path.join(previewDir, 'index.html'),
      counts: manifest.summary.counts,
      exactExports: manifest.exactExports,
      artifacts: session.artifacts.length,
    };
    await writeFile(path.join(assetsDir, 'sync-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    return summary;
  }

  if (payload.kind === 'manifest') {
    await mkdir(path.dirname(session.rawManifestPath), { recursive: true });
    await writeFile(session.rawManifestPath, `${JSON.stringify(payload.json, null, 2)}\n`, 'utf8');
    return { ok: true, relativePath: 'raw/plugin-manifest.json' };
  }

  if (payload.kind) {
    const prepared = prepareArtifact(payload);
    const result = await writePluginArtifact({ assetsDir, artifact: prepared });
    const record = {
      kind: payload.kind,
      nodeId: payload.nodeId,
      nodeName: payload.nodeName,
      imageHash: payload.imageHash,
      imageSize: payload.imageSize,
      scale: payload.scale,
      relativePath: result.relativePath,
      publicPath: result.publicPath,
      bytes: result.bytes,
    };
    session.artifacts.push(record);
    await writeFile(path.join(session.dir, 'artifacts.json'), `${JSON.stringify(session.artifacts, null, 2)}\n`, 'utf8');
    return { ok: true, relativePath: result.relativePath, bytes: result.bytes };
  }

  throw new Error(`Unsupported payload kind: ${payload.kind}`);
}

function prepareArtifact(payload) {
  let relativePath = payload.relativePath || `${payload.kind}/${payload.nodeId || Date.now()}`;
  if (payload.kind === 'image') {
    const bytes = Buffer.from(payload.dataBase64 || '', 'base64');
    const ext = detectImageExtension(bytes, payload.mime);
    const withoutExt = relativePath.replace(/\.[a-z0-9]+$/i, '');
    relativePath = `${withoutExt}${ext}`;
  }
  const parts = relativePath.split('/').map((part) => sanitizeFileName(part));
  return { ...payload, relativePath: parts.join('/') };
}

function ensureSession(sessionId) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);
  const safeId = sanitizeFileName(sessionId);
  const session = {
    id: safeId,
    dir: path.join(cacheDir, safeId),
    rawManifestPath: path.join(cacheDir, safeId, 'plugin-manifest.json'),
    artifacts: [],
  };
  sessions.set(sessionId, session);
  mkdir(session.dir, { recursive: true }).catch(() => {});
  return session;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  return JSON.parse(text);
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}
