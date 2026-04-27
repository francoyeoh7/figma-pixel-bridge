import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

export function sanitizeFileName(name, fallback = 'asset') {
  const clean = String(name ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return clean || fallback;
}

export function detectImageExtension(bytes, mime = '') {
  const mediaType = String(mime).split(';')[0].trim().toLowerCase();
  if (mediaType === 'image/png') return '.png';
  if (mediaType === 'image/jpeg' || mediaType === 'image/jpg') return '.jpg';
  if (mediaType === 'image/webp') return '.webp';
  if (mediaType === 'image/svg+xml') return '.svg';
  if (mediaType === 'image/gif') return '.gif';

  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return '.png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  if (buffer.length >= 6 && buffer.slice(0, 6).toString('ascii').startsWith('GIF')) return '.gif';
  const start = buffer.slice(0, 200).toString('utf8').trimStart().toLowerCase();
  if (start.startsWith('<svg') || start.startsWith('<?xml')) return '.svg';
  return '.bin';
}

export function pluginArtifactPublicPath(relativePath) {
  return `../../public/figma-assets/${relativePath.replace(/^\/+/, '')}`;
}

export async function writePluginArtifact({ assetsDir, artifact }) {
  if (!artifact?.relativePath) throw new Error('Artifact relativePath is required');
  const safeRelative = artifact.relativePath.split('/').map((part) => sanitizeFileName(part)).join('/');
  const outputPath = path.join(assetsDir, safeRelative);
  if (!outputPath.startsWith(assetsDir)) throw new Error(`Unsafe artifact path: ${artifact.relativePath}`);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let bytes;
  if (artifact.dataBase64) {
    bytes = Buffer.from(artifact.dataBase64, 'base64');
  } else if (artifact.text !== undefined) {
    bytes = Buffer.from(String(artifact.text), 'utf8');
  } else if (artifact.json !== undefined) {
    bytes = Buffer.from(`${JSON.stringify(artifact.json, null, 2)}\n`, 'utf8');
  } else {
    throw new Error(`Artifact ${artifact.relativePath} has no data`);
  }

  await writeFile(outputPath, bytes);
  return {
    path: outputPath,
    relativePath: safeRelative,
    publicPath: pluginArtifactPublicPath(safeRelative),
    bytes: bytes.length,
  };
}

export function normalizePluginPayloadToManifest(payload) {
  const rawRoots = payload.roots?.length ? payload.roots : payload.nodes?.filter((node) => ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 'SECTION'].includes(node.type)).slice(0, 1) ?? [];
  const screenRoots = rawRoots.filter(isScreenRoot);
  const roots = screenRoots.length ? screenRoots : rawRoots;
  const fallbackRoot = roots[0] ?? payload.nodes?.[0] ?? { id: 'root', name: payload.source?.pageName ?? 'Figma Root', absoluteBox: { x: 0, y: 0, width: 0, height: 0 } };
  const artifactMap = buildArtifactMap(payload.artifacts ?? []);
  const nodeById = new Map((payload.nodes ?? []).map((node) => [node.id, node]));
  const screens = roots.length
    ? roots.map((root) => pluginRootToScreen(root, nodeById, artifactMap, payload.artifacts ?? []))
    : [pluginRootToScreen(fallbackRoot, nodeById, artifactMap, payload.artifacts ?? [])];
  const firstScreen = screens[0] ?? pluginRootToScreen(fallbackRoot, nodeById, artifactMap, payload.artifacts ?? []);
  const components = (payload.components ?? []).map((component) => ({
    id: component.id,
    key: component.key,
    name: component.name,
    type: component.type,
  }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    generator: 'figma-plugin-bridge',
    fileKey: payload.fileKey ?? '',
    source: payload.source ?? {},
    root: firstScreen.root,
    exactExports: firstScreen.exactExports,
    components,
    nodes: firstScreen.nodes,
    screens,
  };
  manifest.summary = summarizePluginManifest({ ...manifest, nodes: screens.flatMap((screen) => screen.nodes ?? []) });
  return manifest;
}

function isScreenRoot(root) {
  const box = normalizeBox(root.absoluteBox ?? root.box);
  return ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION'].includes(root.type)
    && box.width >= 300
    && box.height >= 300;
}

function pluginRootToScreen(root, nodeById, artifactMap, artifacts) {
  const rootBox = normalizeBox(root.absoluteBox ?? root.box);
  const sourceNodes = collectRootNodes(root, nodeById);
  const nodes = sourceNodes
    .filter((node) => node.visible !== false && (node.absoluteBox || node.box))
    .map((node) => pluginNodeToManifest(node, rootBox, artifactMap));
  const screen = {
    id: root.id,
    name: root.name ?? 'Figma Root',
    type: root.type ?? 'FRAME',
    root: {
      id: root.id,
      name: root.name ?? 'Figma Root',
      type: root.type ?? 'FRAME',
      size: { width: rootBox.width, height: rootBox.height },
      origin: { x: rootBox.x, y: rootBox.y },
    },
    exactExports: pickExactExports(root.id, artifacts),
    nodes,
  };
  screen.summary = summarizePluginManifest({ nodes, components: [] });
  return screen;
}

function collectRootNodes(root, nodeById) {
  const nodes = [];
  const visited = new Set();
  const rootBox = normalizeBox(root.absoluteBox ?? root.box);
  function visit(source) {
    if (!source?.id || visited.has(source.id)) return;
    visited.add(source.id);
    const node = nodeById.get(source.id) ?? source;
    nodes.push(node);
    for (const childId of node.children ?? []) visit(nodeById.get(childId) ?? { id: childId });
  }
  if (root.children?.length) {
    visit(root);
  } else {
    for (const node of nodeById.values()) {
      const box = normalizeBox(node.absoluteBox ?? node.box);
      if (node.id === root.id || isBoxInside(box, rootBox)) nodes.push(node);
    }
    if (!nodes.some((node) => node.id === root.id)) nodes.unshift(root);
  }
  return nodes;
}

function isBoxInside(box, parent) {
  return box.x >= parent.x
    && box.y >= parent.y
    && box.x + box.width <= parent.x + parent.width
    && box.y + box.height <= parent.y + parent.height;
}

function pluginNodeToManifest(node, rootBox, artifactMap) {
  const absoluteBox = normalizeBox(node.absoluteBox ?? node.box);
  const asset = pickPluginNodeAsset(node, artifactMap);
  return compactObject({
    id: node.id,
    name: node.name ?? node.id,
    type: node.type,
    text: node.text,
    box: {
      x: round(absoluteBox.x - rootBox.x),
      y: round(absoluteBox.y - rootBox.y),
      width: absoluteBox.width,
      height: absoluteBox.height,
    },
    absoluteBox,
    fill: firstFill(node.fills),
    stroke: firstFill(node.strokes),
    strokeWeight: node.strokeWeight,
    radius: node.cornerRadius,
    opacity: node.opacity === 1 ? undefined : node.opacity,
    asset,
    font: node.font,
    effects: node.effects,
    layout: node.layout,
    children: node.children,
  });
}

function buildArtifactMap(artifacts) {
  const map = new Map();
  for (const artifact of artifacts) {
    if (!artifact.relativePath) continue;
    const normalized = { ...artifact, publicPath: pluginArtifactPublicPath(artifact.relativePath) };
    if (artifact.imageHash) map.set(`image:${artifact.imageHash}`, normalized);
    if (artifact.nodeId && artifact.kind) map.set(`${artifact.kind}:${artifact.nodeId}`, normalized);
    if (artifact.nodeId && artifact.kind === 'svg') map.set(`svg:${artifact.nodeId}`, normalized);
  }
  return map;
}

function pickPluginNodeAsset(node, artifactMap) {
  const imageHash = node.imageHash ?? node.fills?.find((fill) => fill.type === 'IMAGE')?.imageHash;
  if (imageHash && artifactMap.has(`image:${imageHash}`)) {
    const asset = artifactMap.get(`image:${imageHash}`);
    return { kind: 'image', imageHash, nodeId: node.id, publicPath: asset.publicPath };
  }
  if (artifactMap.has(`svg:${node.id}`)) {
    const asset = artifactMap.get(`svg:${node.id}`);
    return { kind: 'svg', nodeId: node.id, publicPath: asset.publicPath };
  }
  return undefined;
}

function pickExactExports(rootId, artifacts) {
  const rootArtifacts = artifacts.filter((artifact) => artifact.nodeId === rootId);
  const svg = rootArtifacts.find((artifact) => artifact.kind === 'root-svg');
  const png = rootArtifacts
    .filter((artifact) => artifact.kind === 'root-png')
    .sort((a, b) => (b.scale ?? 0) - (a.scale ?? 0))[0];
  return compactObject({
    svg: svg ? { ...svg, publicPath: pluginArtifactPublicPath(svg.relativePath) } : undefined,
    png: png ? { ...png, publicPath: pluginArtifactPublicPath(png.relativePath) } : undefined,
  });
}

function firstFill(fills = []) {
  const fill = fills.find((item) => item.visible !== false && item.type !== 'IMAGE');
  if (!fill) return '';
  if (fill.type === 'SOLID') return fill.color;
  if (fill.css) return fill.css;
  return '';
}

function summarizePluginManifest(manifest) {
  const colors = uniqueSorted((manifest.nodes ?? []).flatMap((node) => [node.fill, node.stroke].filter(Boolean)));
  const radii = uniqueSorted((manifest.nodes ?? []).map((node) => node.radius).filter((value) => value !== undefined));
  const typography = uniqueSorted((manifest.nodes ?? [])
    .filter((node) => node.font)
    .map((node) => `${node.font.family} / ${node.font.size}px / ${node.font.weight}`));
  const assets = (manifest.nodes ?? []).filter((node) => node.asset).map((node) => node.asset);
  return {
    colors,
    typography,
    radii,
    components: manifest.components ?? [],
    assets,
    exactExports: manifest.exactExports ?? {},
    counts: {
      nodes: manifest.nodes?.length ?? 0,
      text: (manifest.nodes ?? []).filter((node) => node.type === 'TEXT').length,
      images: assets.filter((asset) => asset.kind === 'image').length,
      vectors: assets.filter((asset) => asset.kind === 'svg').length,
    },
  };
}

function normalizeBox(box = {}) {
  return {
    x: round(box.x ?? 0),
    y: round(box.y ?? 0),
    width: round(box.width ?? 0),
    height: round(box.height ?? 0),
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))].sort((a, b) => String(a).localeCompare(String(b)));
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)));
}

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}
