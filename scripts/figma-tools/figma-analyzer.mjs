import { figmaNodeIdToFileName } from './figma-api.mjs';

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'REGULAR_POLYGON']);
const CONTAINER_TYPES = new Set(['DOCUMENT', 'CANVAS', 'FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);

export function flattenVisibleNodes(root) {
  const nodes = [];
  function visit(node) {
    if (!node || node.visible === false) return;
    nodes.push(node);
    for (const child of node.children ?? []) visit(child);
  }
  visit(root);
  return nodes;
}

export function figmaColorToCss(color, opacity) {
  const alpha = opacity ?? color?.a ?? 1;
  const r = Math.round(clamp01(color?.r ?? 0) * 255);
  const g = Math.round(clamp01(color?.g ?? 0) * 255);
  const b = Math.round(clamp01(color?.b ?? 0) * 255);
  return `rgba(${r}, ${g}, ${b}, ${round(alpha)})`;
}

export function paintToCss(paint) {
  if (!paint || paint.visible === false) return '';
  if (paint.type === 'SOLID' && paint.color) {
    const alpha = (paint.opacity ?? 1) * (paint.color.a ?? 1);
    const r = Math.round(clamp01(paint.color.r) * 255);
    const g = Math.round(clamp01(paint.color.g) * 255);
    const b = Math.round(clamp01(paint.color.b) * 255);
    if (alpha >= 0.999) return rgbToHex(r, g, b);
    return `rgba(${r}, ${g}, ${b}, ${round(alpha)})`;
  }
  if (paint.type?.startsWith('GRADIENT') && Array.isArray(paint.gradientStops)) {
    const stops = paint.gradientStops
      .map((stop) => `${figmaColorToCss(stop.color)} ${Math.round((stop.position ?? 0) * 100)}%`)
      .join(', ');
    if (paint.type === 'GRADIENT_RADIAL') return `radial-gradient(circle, ${stops})`;
    return `linear-gradient(135deg, ${stops})`;
  }
  return '';
}

export function collectAssetCandidates(root) {
  const imageRefs = [];
  const svgNodes = [];
  const frameNodes = [];
  const seenImageRefs = new Set();
  const seenSvg = new Set();

  for (const node of flattenVisibleNodes(root)) {
    for (const fill of node.fills ?? []) {
      if (fill?.type === 'IMAGE' && fill.visible !== false && fill.imageRef && !seenImageRefs.has(fill.imageRef)) {
        seenImageRefs.add(fill.imageRef);
        imageRefs.push({ imageRef: fill.imageRef, nodeId: node.id, nodeName: node.name ?? node.id });
      }
    }

    if (shouldExportSvg(node) && !seenSvg.has(node.id)) {
      seenSvg.add(node.id);
      svgNodes.push({ nodeId: node.id, nodeName: node.name ?? node.id, type: node.type });
    }

    if (node.absoluteBoundingBox && ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION'].includes(node.type)) {
      frameNodes.push({ nodeId: node.id, nodeName: node.name ?? node.id, type: node.type });
    }
  }

  return { imageRefs, svgNodes, frameNodes };
}

export function nodeToManifest(root, { fileKey = '', rootId = root?.id ?? '', assetMap = new Map(), fileJson = null } = {}) {
  const rootBox = getRootBounds(root);
  const nodes = flattenVisibleNodes(root)
    .filter((node) => node.absoluteBoundingBox || node.id === root.id)
    .map((node) => normalizeNode(node, rootBox, assetMap));
  const components = extractComponents(fileJson, root);
  const manifest = {
    generatedAt: new Date().toISOString(),
    fileKey,
    root: {
      id: rootId || root?.id || '',
      name: root?.name ?? 'Figma Root',
      type: root?.type ?? 'UNKNOWN',
      size: { width: round(rootBox.width), height: round(rootBox.height) },
      origin: { x: round(rootBox.x), y: round(rootBox.y) },
    },
    components,
    nodes,
  };
  manifest.summary = summarizeManifest(manifest);
  return manifest;
}

export function summarizeManifest(manifest) {
  const colors = uniqueSorted((manifest.nodes ?? []).flatMap((node) => [node.fill, node.stroke].filter(Boolean)));
  const radii = uniqueSorted((manifest.nodes ?? []).map((node) => node.radius).filter((value) => typeof value === 'number'));
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
    counts: {
      nodes: manifest.nodes?.length ?? 0,
      text: (manifest.nodes ?? []).filter((node) => node.type === 'TEXT').length,
      images: assets.filter((asset) => asset.kind === 'image').length,
      vectors: assets.filter((asset) => asset.kind === 'svg').length,
    },
  };
}

export function analyzeFigmaDocument(fileJson, { rootNode, rootId, fileKey, assetMap = new Map() } = {}) {
  return nodeToManifest(rootNode, { fileKey, rootId, assetMap, fileJson });
}

export function getRootBounds(root) {
  if (root?.absoluteBoundingBox) return normalizeBox(root.absoluteBoundingBox);
  const boxes = flattenVisibleNodes(root).map((node) => node.absoluteBoundingBox).filter(Boolean);
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return normalizeBox({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function normalizeNode(node, rootBox, assetMap) {
  const abs = node.absoluteBoundingBox ?? rootBox;
  const fills = Array.isArray(node.fills) ? node.fills.filter((paint) => paint.visible !== false) : [];
  const strokes = Array.isArray(node.strokes) ? node.strokes.filter((paint) => paint.visible !== false) : [];
  const imageFill = fills.find((paint) => paint.type === 'IMAGE' && paint.imageRef);
  const fill = fills.find((paint) => paint.type !== 'IMAGE');
  const stroke = strokes[0];
  const asset = pickAsset(node, imageFill, assetMap);

  return compactObject({
    id: node.id,
    name: node.name ?? node.id,
    type: node.type,
    parent: node.parentId,
    text: node.type === 'TEXT' ? node.characters ?? '' : undefined,
    box: {
      x: round(abs.x - rootBox.x),
      y: round(abs.y - rootBox.y),
      width: round(abs.width),
      height: round(abs.height),
    },
    absoluteBox: normalizeBox(abs),
    fill: paintToCss(fill),
    stroke: paintToCss(stroke),
    strokeWeight: node.strokeWeight ? round(node.strokeWeight) : undefined,
    radius: normalizeRadius(node),
    opacity: node.opacity === undefined ? undefined : round(node.opacity),
    blendMode: node.blendMode,
    asset,
    font: node.type === 'TEXT' ? normalizeFont(node) : undefined,
    effects: normalizeEffects(node.effects),
    children: node.children?.map((child) => child.id),
  });
}

function shouldExportSvg(node) {
  if (!node?.absoluteBoundingBox) return false;
  if (VECTOR_TYPES.has(node.type)) return true;
  if (!['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT'].includes(node.type)) return false;
  const name = String(node.name ?? '').toLowerCase();
  const box = node.absoluteBoundingBox;
  const small = box.width <= 128 && box.height <= 128;
  const iconLikeName = /(^|[\s_\-/])(icon|ico|图标|arrow|chevron|search|close|menu|plus|minus|logo)([\s_\-/]|$)/i.test(name);
  return small && iconLikeName && !containsText(node);
}

function containsText(node) {
  if (node.type === 'TEXT') return true;
  return (node.children ?? []).some(containsText);
}

function pickAsset(node, imageFill, assetMap) {
  if (imageFill?.imageRef) {
    return assetMap.get(`image:${imageFill.imageRef}`) ?? { kind: 'image-ref', imageRef: imageFill.imageRef };
  }
  return assetMap.get(`svg:${node.id}`) ?? assetMap.get(`png:${node.id}`);
}

function normalizeFont(node) {
  const style = node.style ?? {};
  return compactObject({
    family: style.fontFamily ?? 'sans-serif',
    postScriptName: style.fontPostScriptName,
    size: style.fontSize ? round(style.fontSize) : undefined,
    weight: style.fontWeight ?? undefined,
    lineHeight: style.lineHeightPx ? round(style.lineHeightPx) : undefined,
    letterSpacing: style.letterSpacing ? round(style.letterSpacing) : undefined,
    align: style.textAlignHorizontal ?? undefined,
    verticalAlign: style.textAlignVertical ?? undefined,
  });
}

function normalizeRadius(node) {
  if (typeof node.cornerRadius === 'number') return round(node.cornerRadius);
  const radii = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius']
    .map((key) => node[key])
    .filter((value) => typeof value === 'number');
  if (!radii.length) return undefined;
  return radii.map(round);
}

function normalizeEffects(effects = []) {
  const visible = effects.filter((effect) => effect.visible !== false);
  if (!visible.length) return undefined;
  return visible.map((effect) => compactObject({
    type: effect.type,
    color: effect.color ? figmaColorToCss(effect.color, effect.color.a) : undefined,
    offset: effect.offset ? { x: round(effect.offset.x), y: round(effect.offset.y) } : undefined,
    radius: effect.radius ? round(effect.radius) : undefined,
    spread: effect.spread ? round(effect.spread) : undefined,
  }));
}

function extractComponents(fileJson, root) {
  const fromMetadata = Object.entries(fileJson?.components ?? {}).map(([id, component]) => ({
    id,
    key: component.key,
    name: component.name,
    description: component.description,
  }));
  const fromNodes = flattenVisibleNodes(root)
    .filter((node) => ['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(node.type))
    .map((node) => ({ id: node.id, name: node.name, type: node.type }));
  const merged = new Map();
  for (const component of [...fromMetadata, ...fromNodes]) merged.set(component.id, component);
  return [...merged.values()];
}

function normalizeBox(box) {
  return {
    x: round(box.x ?? 0),
    y: round(box.y ?? 0),
    width: round(box.width ?? 0),
    height: round(box.height ?? 0),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value ?? 0)));
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))].sort((a, b) => String(a).localeCompare(String(b)));
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)));
}

export function assetFileBase(nodeId, nodeName = '') {
  const cleanName = String(nodeName).trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${figmaNodeIdToFileName(nodeId)}${cleanName ? `-${cleanName}` : ''}`;
}
