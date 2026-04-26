#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PEN = process.env.FRONTEND_TO_FIGMA_PEN || 'design.pen';

export async function buildFrontendToFigmaPayload({ cwd = process.cwd(), penFile = DEFAULT_PEN, includeImages = true } = {}) {
  const penPath = path.join(cwd, penFile);
  const pen = JSON.parse(await readFile(penPath, 'utf8'));
  const roots = (pen.children ?? []).map(normalizeNode).filter(Boolean);
  const assets = includeImages ? await loadAssets(cwd) : [];
  injectFrontendImageLayers(roots, assets);
  return {
    version: 1,
    source: {
      name: 'Figma Pixel Bridge frontend import',
      penFile,
      generatedAt: new Date().toISOString(),
      note: 'Generated from local frontend/Pencil design data. Run inside the target Figma file to create editable frames.',
    },
    roots,
    assets,
  };
}

function normalizeNode(node) {
  if (!node?.type || !node.id) return null;
  return compact({
    id: node.id,
    type: normalizeType(node.type),
    name: node.name ?? node.id,
    x: number(node.x, 0),
    y: number(node.y, 0),
    width: number(node.width, undefined),
    height: number(node.height, undefined),
    fill: node.fill,
    stroke: normalizeStroke(node.stroke),
    radius: normalizeRadius(node),
    rotation: number(node.rotation, undefined),
    clip: node.clip,
    text: node.content,
    fontFamily: node.fontFamily,
    fontSize: number(node.fontSize, undefined),
    fontWeight: node.fontWeight ? String(node.fontWeight) : undefined,
    children: (node.children ?? []).map(normalizeNode).filter(Boolean),
  });
}

function normalizeType(type) {
  if (type === 'frame') return 'FRAME';
  if (type === 'rectangle') return 'RECTANGLE';
  if (type === 'text') return 'TEXT';
  if (type === 'line') return 'LINE';
  return String(type).toUpperCase();
}

function normalizeStroke(stroke) {
  if (!stroke) return undefined;
  if (typeof stroke === 'string') return { color: stroke, thickness: 1 };
  return compact({ color: stroke.fill ?? '#FFFFFF', thickness: number(stroke.thickness, 1), align: stroke.align });
}

function normalizeRadius(node) {
  for (const key of ['cornerRadius', 'radius']) {
    if (typeof node[key] === 'number') return node[key];
  }
  return undefined;
}

async function loadAssets(cwd) {
  const candidates = [
    { key: 'bgFactoryOptimized', path: 'public/optimized/bg-factory-1920.jpg', mime: 'image/jpeg' },
    { key: 'characterOptimized', path: 'public/optimized/character-900.png', mime: 'image/png' },
  ];
  const assets = [];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(path.join(cwd, candidate.path));
      assets.push({ ...candidate, dataBase64: bytes.toString('base64'), bytes: bytes.length });
    } catch {
      // Optional visual assets are skipped when unavailable.
    }
  }
  return assets;
}

function injectFrontendImageLayers(roots, assets) {
  const first = roots.find((root) => root.type === 'FRAME' && /部署总览|home|总览/i.test(root.name));
  if (!first) return;
  const hasBg = assets.some((asset) => asset.key === 'bgFactoryOptimized');
  const hasCharacter = assets.some((asset) => asset.key === 'characterOptimized');
  const injected = [];
  if (hasBg) {
    injected.push({
      id: 'frontend-bg-factory', type: 'IMAGE', name: '前端真实军工厂背景图', x: -29, y: -18, width: 1498, height: 936, imageKey: 'bgFactoryOptimized', opacity: 0.72,
    });
  }
  if (hasCharacter) {
    injected.push({
      id: 'frontend-character', type: 'IMAGE', name: '前端真实特工人物图', x: 660, y: 155, width: 524, height: 702, imageKey: 'characterOptimized', opacity: 1,
    });
  }
  if (!injected.length) return;
  const children = first.children ?? [];
  first.children = [children[0], ...injected, ...children.slice(1)].filter(Boolean);
}

function number(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildFrontendToFigmaPayload().then((payload) => {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
