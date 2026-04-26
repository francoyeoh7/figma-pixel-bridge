#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runFigmaSync } from './figma-sync.mjs';
import { loadFigmaConfig } from './figma-tools/figma-api.mjs';

const serverInfo = { name: 'figma-pixel-bridge', version: '0.1.0' };
let inputBuffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  drainInput();
});

function drainInput() {
  let newlineIndex;
  while ((newlineIndex = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    if (!line) continue;
    handleLine(line).catch((error) => sendError(null, -32603, error.message));
  }
}

async function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, `Parse error: ${error.message}`);
    return;
  }

  if (!request.id && request.method?.startsWith('notifications/')) return;

  try {
    if (request.method === 'initialize') {
      sendResult(request.id, {
        protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo,
      });
      return;
    }

    if (request.method === 'tools/list') {
      sendResult(request.id, { tools: listTools() });
      return;
    }

    if (request.method === 'tools/call') {
      const result = await callTool(request.params?.name, request.params?.arguments ?? {});
      sendResult(request.id, result);
      return;
    }

    if (['figma.sync', 'figma.analyze', 'figma.generatePreview'].includes(request.method)) {
      const result = await callTool(request.method, request.params ?? {});
      sendResult(request.id, result);
      return;
    }

    sendError(request.id, -32601, `Unknown method: ${request.method}`);
  } catch (error) {
    sendError(request.id, -32603, error.message);
  }
}

function listTools() {
  return [
    {
      name: 'figma.sync',
      description: 'Fetch the configured Figma file, export high-resolution assets, write the manifest, and generate preview HTML.',
      inputSchema: toolSchema({ includeDownloadAssets: true, includeGeneratePreview: true }),
    },
    {
      name: 'figma.analyze',
      description: 'Fetch and analyze the configured Figma file, writing a design manifest without downloading binary assets.',
      inputSchema: toolSchema({ includeDownloadAssets: false, includeGeneratePreview: false }),
    },
    {
      name: 'figma.generatePreview',
      description: 'Generate or regenerate the preview HTML from the latest manifest; if no manifest exists, runs a full sync.',
      inputSchema: toolSchema({ includeDownloadAssets: true, includeGeneratePreview: true }),
    },
  ];
}

function toolSchema() {
  return {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Project directory. Defaults to the current working directory.' },
      figmaUrl: { type: 'string', description: 'Figma design URL.' },
      fileKey: { type: 'string', description: 'Figma file key.' },
      nodeId: { type: 'string', description: 'Figma node id, for example 0:1.' },
      downloadAssets: { type: 'boolean', description: 'Whether to download image/SVG/PNG assets.' },
      generatePreview: { type: 'boolean', description: 'Whether to write generated/figma-preview/index.html.' },
    },
  };
}

async function callTool(name, args) {
  const cwd = args.cwd ?? process.cwd();
  if (name === 'figma.generatePreview') {
    const manifestPath = path.join(cwd, 'public', 'figma-assets', 'design-manifest.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const { generatePreviewHtml } = await import('./figma-tools/preview-generator.mjs');
      const { mkdir, writeFile } = await import('node:fs/promises');
      const previewDir = path.join(cwd, 'generated', 'figma-preview');
      await mkdir(previewDir, { recursive: true });
      await writeFile(path.join(previewDir, 'index.html'), generatePreviewHtml(manifest), 'utf8');
      return textResult({ previewPath: path.join(previewDir, 'index.html'), sourceManifest: manifestPath });
    } catch {
      const summary = await runFigmaSync({ ...args, cwd, downloadAssets: args.downloadAssets ?? true, generatePreview: true, quiet: true });
      return textResult(summary);
    }
  }

  if (name === 'figma.analyze') {
    await loadFigmaConfig({ cwd, overrides: args });
    const summary = await runFigmaSync({ ...args, cwd, downloadAssets: false, generatePreview: false, quiet: true });
    return textResult(summary);
  }

  if (name === 'figma.sync') {
    const summary = await runFigmaSync({ ...args, cwd, downloadAssets: args.downloadAssets ?? true, generatePreview: args.generatePreview ?? true, quiet: true });
    return textResult(summary);
  }

  throw new Error(`Unknown tool: ${name}`);
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function sendResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function sendError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}
