import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_FIGMA_URL = '';
export const FIGMA_API_BASE = 'https://api.figma.com/v1';

export function parseFigmaTarget(input = DEFAULT_FIGMA_URL) {
  if (typeof input === 'object' && input?.fileKey) {
    return {
      fileKey: input.fileKey,
      nodeId: normalizeFigmaNodeId(input.nodeId ?? input.node ?? ''),
    };
  }

  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Figma URL or file key is required. Set FIGMA_URL or FIGMA_FILE_KEY in .env.local.');
  }

  if (!raw.startsWith('http')) {
    return { fileKey: raw, nodeId: '' };
  }

  const url = new URL(raw);
  const parts = url.pathname.split('/').filter(Boolean);
  const designIndex = parts.findIndex((part) => ['design', 'file', 'proto'].includes(part));
  const fileKey = designIndex >= 0 ? parts[designIndex + 1] : '';
  if (!fileKey) {
    throw new Error(`Could not parse Figma file key from URL: ${raw}`);
  }

  return {
    fileKey,
    nodeId: normalizeFigmaNodeId(url.searchParams.get('node-id') ?? ''),
  };
}

export function normalizeFigmaNodeId(nodeId = '') {
  return String(nodeId).trim().replace(/-/g, ':');
}

export function figmaNodeIdToFileName(nodeId = '') {
  return String(nodeId)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'node';
}

export async function loadEnvFile(cwd = process.cwd(), fileName = '.env.local') {
  const envPath = path.join(cwd, fileName);
  try {
    const text = await readFile(envPath, 'utf8');
    const parsed = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equals = trimmed.indexOf('=');
      if (equals === -1) continue;
      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      parsed[key] = value;
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export async function loadFigmaConfig({ cwd = process.cwd(), overrides = {} } = {}) {
  const env = await loadEnvFile(cwd);
  const target = parseFigmaTarget(
    overrides.figmaUrl
      ?? process.env.FIGMA_URL
      ?? env.FIGMA_URL
      ?? overrides.fileKey
      ?? process.env.FIGMA_FILE_KEY
      ?? env.FIGMA_FILE_KEY
      ?? DEFAULT_FIGMA_URL,
  );

  return {
    cwd,
    token: overrides.token ?? process.env.FIGMA_TOKEN ?? env.FIGMA_TOKEN ?? '',
    fileKey: overrides.fileKey ?? process.env.FIGMA_FILE_KEY ?? env.FIGMA_FILE_KEY ?? target.fileKey,
    nodeId: normalizeFigmaNodeId(overrides.nodeId ?? process.env.FIGMA_NODE_ID ?? env.FIGMA_NODE_ID ?? target.nodeId),
    figmaUrl: overrides.figmaUrl ?? process.env.FIGMA_URL ?? env.FIGMA_URL ?? DEFAULT_FIGMA_URL,
  };
}

export function assertFigmaToken(token) {
  if (!token) {
    throw new Error('Missing FIGMA_TOKEN. Add it to .env.local or export it in the shell.');
  }
}

export async function figmaFetch(endpoint, { token, method = 'GET', body, baseUrl = FIGMA_API_BASE, retries = 4, timeoutMs = 60_000 } = {}) {
  assertFigmaToken(token);
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'X-Figma-Token': token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      if (attempt < retries && error.name === 'TimeoutError') {
        await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 1000 * 2 ** attempt)));
        continue;
      }
      throw error;
    }

    if (response.ok) return response.json();

    const details = await response.text().catch(() => '');
    if (response.status === 429 && attempt < retries) {
      const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 0);
      if (retryAfterSeconds > 120) throw new Error(figmaApiRateLimitMessage(retryAfterSeconds));
      const delayMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : Math.min(30_000, 1500 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (response.status === 429) throw new Error(figmaApiRateLimitMessage(Number(response.headers.get('retry-after') ?? 0)));

    throw new Error(`Figma API request failed (${response.status}) for ${redactUrl(url)}: ${details.slice(0, 500)}`);
  }
  throw new Error(`Figma API request failed for ${redactUrl(url)}`);
}

export function figmaApiRateLimitMessage(retryAfterSeconds = 0) {
  const wait = Number(retryAfterSeconds) > 0 ? ` Figma suggests retrying after ${Number(retryAfterSeconds)} seconds.` : '';
  return [
    'Figma REST API rate limit reached.',
    'This only affects the token-based REST sync path, not the local Figma Pixel Bridge plugin workflow.',
    'You can keep exporting without REST API quota by running `npm run plugin-bridge`, then opening the Figma Pixel Bridge Exporter plugin inside Figma.',
    wait.trim(),
  ].filter(Boolean).join(' ');
}

export async function getFigmaFile({ fileKey, token, geometry = 'paths', filterToNode = false, nodeId = '', depth }) {
  const params = new URLSearchParams();
  if (filterToNode && nodeId) params.set('ids', nodeId);
  if (geometry) params.set('geometry', geometry);
  if (depth) params.set('depth', String(depth));
  params.set('plugin_data', 'shared');
  return figmaFetch(`/files/${fileKey}?${params.toString()}`, { token });
}

export async function getFigmaNodes({ fileKey, nodeIds, token, geometry = 'paths', depth }) {
  const ids = [...new Set(nodeIds.filter(Boolean))];
  if (!ids.length) return { nodes: {} };
  const params = new URLSearchParams({ ids: ids.join(',') });
  if (geometry) params.set('geometry', geometry);
  if (depth) params.set('depth', String(depth));
  params.set('plugin_data', 'shared');
  return figmaFetch(`/files/${fileKey}/nodes?${params.toString()}`, { token });
}

export async function getFigmaImageFills({ fileKey, token }) {
  return figmaFetch(`/files/${fileKey}/images`, { token });
}

export async function exportFigmaNodes({ fileKey, nodeIds, token, format = 'svg', scale = 1 }) {
  const ids = [...new Set(nodeIds.filter(Boolean))];
  if (!ids.length) return { images: {} };
  const params = new URLSearchParams({ ids: ids.join(','), format });
  if (format !== 'svg') params.set('scale', String(scale));
  if (format === 'svg') params.set('svg_include_id', 'true');
  return figmaFetch(`/images/${fileKey}?${params.toString()}`, { token });
}

export function findNodeById(node, nodeId) {
  if (!node || !nodeId) return null;
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function pickRootNode(fileJson, nodeId) {
  if (nodeId && fileJson?.nodes?.[nodeId]?.document) return fileJson.nodes[nodeId].document;
  if (nodeId) {
    const found = findNodeById(fileJson?.document, nodeId);
    if (found) return found;
  }
  return fileJson?.document;
}

export async function downloadUrlToFile(url, outputPath) {
  if (!url) throw new Error(`Missing download URL for ${outputPath}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${redactUrl(url)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  return {
    bytes: bytes.length,
    contentType: response.headers.get('content-type') ?? '',
  };
}

export function extensionFromContentType(contentType = '', fallback = '.bin') {
  const clean = contentType.split(';')[0].trim().toLowerCase();
  if (clean === 'image/png') return '.png';
  if (clean === 'image/jpeg' || clean === 'image/jpg') return '.jpg';
  if (clean === 'image/webp') return '.webp';
  if (clean === 'image/svg+xml') return '.svg';
  if (clean === 'image/gif') return '.gif';
  return fallback;
}

export function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('token');
    parsed.searchParams.delete('X-Figma-Token');
    return parsed.toString();
  } catch {
    return String(url).replace(/figd_[A-Za-z0-9_\-]+/g, '[redacted-token]');
  }
}

export async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
