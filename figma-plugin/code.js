figma.showUI(__html__, { width: 440, height: 680, themeColors: true });

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'REGULAR_POLYGON']);
const EXPORTABLE_TYPES = new Set(['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 'SECTION']);
let requestSeq = 0;
const pendingUploads = new Map();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'upload-ack') {
    const pending = pendingUploads.get(msg.requestId);
    if (!pending) return;
    pendingUploads.delete(msg.requestId);
    if (msg.error) pending.reject(new Error(msg.error));
    else pending.resolve(msg.result);
    return;
  }

  if (msg.type !== 'start-export') return;
  try {
    await runExport(msg);
    notify('全部导出完成。回到项目运行 npm run preview:figma 查看。', 'ok', true);
  } catch (error) {
    notify((error && (error.stack || error.message)) || String(error), 'error', true);
  }
};

async function runExport(options) {
  const bridgeUrl = options.bridgeUrl || 'http://localhost:4758';
  const scale = Math.max(1, Math.min(Number(options.scale || 4), 8));
  const roots = getExportRoots(options.scope);
  if (!roots.length) throw new Error('当前页面没有可导出的节点。请选中一个 Frame，或选择整页顶层导出。');

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  notify(`会话 ${sessionId}，根节点 ${roots.length} 个，PNG ${scale}x`);

  const allNodes = [];
  const allComponents = [];
  const imageHashes = new Map();
  const vectorNodes = [];
  const artifacts = [];

  for (const root of roots) {
    walk(root, (node) => {
      const summary = summarizeNode(node);
      allNodes.push(summary);
      if (summary.component || summary.type === 'COMPONENT' || summary.type === 'INSTANCE') {
        allComponents.push({ id: summary.id, key: summary.componentKey, name: summary.name, type: summary.type });
      }
      for (const fill of summary.fills || []) {
        if (fill.type === 'IMAGE' && fill.imageHash && !imageHashes.has(fill.imageHash)) {
          imageHashes.set(fill.imageHash, { imageHash: fill.imageHash, nodeId: summary.id, nodeName: summary.name });
        }
      }
      if (shouldExportSvg(node)) vectorNodes.push(node);
    });
  }

  notify(`节点 ${allNodes.length} 个，图片 ${imageHashes.size} 个，icon/vector ${vectorNodes.length} 个。`);

  for (const [imageHash, image] of imageHashes) {
    const artifact = await exportImageHash(imageHash, image, sessionId, bridgeUrl);
    if (artifact) artifacts.push(stripArtifactData(artifact));
  }

  for (const node of vectorNodes) {
    const artifact = await exportNodeSvg(node, sessionId, bridgeUrl, 'icons', 'svg');
    if (artifact) artifacts.push(stripArtifactData(artifact));
  }

  for (const root of roots) {
    const svgArtifact = await exportRootSvg(root, sessionId, bridgeUrl);
    if (svgArtifact) artifacts.push(stripArtifactData(svgArtifact));
    const pngArtifact = await exportRootPng(root, sessionId, bridgeUrl, scale);
    if (pngArtifact) artifacts.push(stripArtifactData(pngArtifact));
  }

  const manifestPayload = {
    type: 'figma-plugin-manifest',
    sessionId,
    fileKey: figma.fileKey || '',
    source: {
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
      exportedAt: new Date().toISOString(),
      scope: options.scope || 'selection',
      rootCount: roots.length,
      plugin: 'Figma Pixel Bridge Exporter',
    },
    roots: roots.map(summarizeNode),
    nodes: allNodes,
    components: uniqueById(allComponents),
    artifacts,
  };

  await upload(bridgeUrl, {
    sessionId,
    kind: 'manifest',
    relativePath: 'raw/plugin-manifest.json',
    json: manifestPayload,
  });
  await upload(bridgeUrl, { sessionId, kind: 'complete', json: { sessionId, artifacts: artifacts.length, nodes: allNodes.length } });
}

function getExportRoots(scope) {
  const selected = figma.currentPage.selection.filter((node) => node.visible !== false);
  if (scope !== 'page' && selected.length) return selected;
  return figma.currentPage.children.filter((node) => node.visible !== false);
}

function walk(node, visit) {
  if (!node || node.visible === false) return;
  visit(node);
  if ('children' in node) {
    for (const child of node.children) walk(child, visit);
  }
}

function summarizeNode(node) {
  const absoluteBox = getBox(node);
  return compact({
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: node.locked,
    absoluteBox,
    rotation: typeof node.rotation === 'number' ? round(node.rotation) : undefined,
    opacity: typeof node.opacity === 'number' ? round(node.opacity) : undefined,
    blendMode: node.blendMode,
    fills: clonePaints('fills' in node ? node.fills : undefined),
    strokes: clonePaints('strokes' in node ? node.strokes : undefined),
    strokeWeight: 'strokeWeight' in node && typeof node.strokeWeight === 'number' ? round(node.strokeWeight) : undefined,
    cornerRadius: readCornerRadius(node),
    effects: cloneEffects('effects' in node ? node.effects : undefined),
    text: node.type === 'TEXT' ? node.characters : undefined,
    font: node.type === 'TEXT' ? readFont(node) : undefined,
    layout: readLayout(node),
    constraints: 'constraints' in node ? node.constraints : undefined,
    componentKey: 'componentPropertyDefinitions' in node ? node.key : undefined,
    imageHash: firstImageHash(node),
    children: 'children' in node ? node.children.map((child) => child.id) : undefined,
  });
}

function getBox(node) {
  const box = node.absoluteBoundingBox || node.absoluteRenderBounds;
  if (!box) return undefined;
  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
}

function clonePaints(paints) {
  if (!Array.isArray(paints)) return undefined;
  return paints.filter((paint) => paint.visible !== false).map((paint) => compact({
    type: paint.type,
    visible: paint.visible,
    opacity: typeof paint.opacity === 'number' ? round(paint.opacity) : undefined,
    color: paint.color ? colorToCss(paint.color, paint.opacity) : undefined,
    imageHash: paint.type === 'IMAGE' ? paint.imageHash : undefined,
    scaleMode: paint.type === 'IMAGE' ? paint.scaleMode : undefined,
    imageTransform: paint.type === 'IMAGE' ? paint.imageTransform : undefined,
    gradientStops: paint.gradientStops ? paint.gradientStops.map((stop) => ({ position: round(stop.position), color: colorToCss(stop.color) })) : undefined,
  }));
}

function cloneEffects(effects) {
  if (!Array.isArray(effects)) return undefined;
  const visible = effects.filter((effect) => effect.visible !== false);
  if (!visible.length) return undefined;
  return visible.map((effect) => compact({
    type: effect.type,
    radius: typeof effect.radius === 'number' ? round(effect.radius) : undefined,
    spread: typeof effect.spread === 'number' ? round(effect.spread) : undefined,
    offset: effect.offset ? { x: round(effect.offset.x), y: round(effect.offset.y) } : undefined,
    color: effect.color ? colorToCss(effect.color) : undefined,
  }));
}

function readFont(node) {
  const fontName = node.fontName && node.fontName !== figma.mixed ? node.fontName : undefined;
  return compact({
    family: fontName ? fontName.family : node.textStyleId && node.textStyleId !== figma.mixed ? undefined : 'sans-serif',
    style: fontName ? fontName.style : undefined,
    size: node.fontSize !== figma.mixed ? round(node.fontSize) : undefined,
    weight: node.fontWeight !== figma.mixed ? node.fontWeight : undefined,
    lineHeight: node.lineHeight !== figma.mixed ? lineHeightToPx(node.lineHeight, node.fontSize) : undefined,
    letterSpacing: node.letterSpacing !== figma.mixed ? letterSpacingToPx(node.letterSpacing, node.fontSize) : undefined,
    align: node.textAlignHorizontal,
    verticalAlign: node.textAlignVertical,
    paragraphSpacing: node.paragraphSpacing !== figma.mixed ? round(node.paragraphSpacing) : undefined,
  });
}

function readLayout(node) {
  if (!('layoutMode' in node)) return undefined;
  return compact({
    mode: node.layoutMode,
    wrap: node.layoutWrap,
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    itemSpacing: node.itemSpacing,
  });
}

function readCornerRadius(node) {
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number') return round(node.cornerRadius);
  const keys = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  const radii = keys.map((key) => (key in node && typeof node[key] === 'number' ? round(node[key]) : undefined));
  return radii.some((value) => value !== undefined) ? radii : undefined;
}

function firstImageHash(node) {
  const fills = 'fills' in node && Array.isArray(node.fills) ? node.fills : [];
  const image = fills.find((fill) => fill.type === 'IMAGE' && fill.visible !== false && fill.imageHash);
  return image ? image.imageHash : undefined;
}

async function exportImageHash(imageHash, image, sessionId, bridgeUrl) {
  const figmaImage = figma.getImageByHash(imageHash);
  if (!figmaImage) return null;
  const bytes = await figmaImage.getBytesAsync();
  let size;
  if (typeof figmaImage.getSizeAsync === 'function') {
    try {
      size = await figmaImage.getSizeAsync();
    } catch (error) {
      size = undefined;
    }
  }
  const relativePath = `images/${safeName(imageHash + '-' + image.nodeName)}.image`;
  const artifact = {
    sessionId,
    kind: 'image',
    nodeId: image.nodeId,
    nodeName: image.nodeName,
    imageHash,
    relativePath,
    imageSize: size,
    dataBase64: bytesToBase64(bytes),
  };
  const result = await upload(bridgeUrl, artifact);
  notify(`原图 ${image.nodeName} ${size ? `${size.width}x${size.height}` : ''}`);
  return assignArtifactResult(artifact, result.relativePath || relativePath);
}

async function exportNodeSvg(node, sessionId, bridgeUrl, folder, kind) {
  const svg = await node.exportAsync({ format: 'SVG_STRING', svgOutlineText: true, svgIdAttribute: true, svgSimplifyStroke: false });
  const relativePath = `${folder}/${safeName(node.id + '-' + node.name)}.svg`;
  const artifact = { sessionId, kind, nodeId: node.id, nodeName: node.name, relativePath, text: svg };
  const result = await upload(bridgeUrl, artifact);
  notify(`SVG ${node.name}`);
  return assignArtifactResult(artifact, result.relativePath || relativePath);
}

async function exportRootSvg(node, sessionId, bridgeUrl) {
  const svg = await node.exportAsync({ format: 'SVG_STRING', svgOutlineText: true, svgIdAttribute: true, svgSimplifyStroke: false });
  const relativePath = `frames/${safeName(node.id + '-' + node.name)}.svg`;
  const artifact = { sessionId, kind: 'root-svg', nodeId: node.id, nodeName: node.name, relativePath, text: svg };
  const result = await upload(bridgeUrl, artifact);
  notify(`像素锁定 SVG ${node.name}`);
  return assignArtifactResult(artifact, result.relativePath || relativePath);
}

async function exportRootPng(node, sessionId, bridgeUrl, scale) {
  const safeScale = capScaleForNode(node, scale);
  const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: safeScale } });
  const relativePath = `frames/${safeName(node.id + '-' + node.name)}@${safeScale}x.png`;
  const artifact = { sessionId, kind: 'root-png', nodeId: node.id, nodeName: node.name, relativePath, scale: safeScale, dataBase64: bytesToBase64(bytes) };
  const result = await upload(bridgeUrl, artifact);
  notify(`像素锁定 PNG ${node.name} @${safeScale}x`);
  return assignArtifactResult(artifact, result.relativePath || relativePath);
}

function shouldExportSvg(node) {
  const box = node.absoluteBoundingBox;
  if (!box) return false;
  if (VECTOR_TYPES.has(node.type)) return true;
  const name = node.name.toLowerCase();
  const small = box.width <= 160 && box.height <= 160;
  const iconName = /icon|ico|图标|arrow|chevron|search|close|menu|plus|minus|logo/.test(name);
  return small && iconName && !containsText(node);
}

function containsText(node) {
  if (node.type === 'TEXT') return true;
  if (!('children' in node)) return false;
  return node.children.some(containsText);
}

function capScaleForNode(node, requestedScale) {
  const box = node.absoluteBoundingBox;
  if (!box) return requestedScale;
  const maxSide = Math.max(box.width, box.height);
  if (!maxSide) return requestedScale;
  return Math.max(1, Math.min(requestedScale, Math.floor(12000 / maxSide) || 1));
}

function upload(bridgeUrl, payload) {
  const requestId = ++requestSeq;
  figma.ui.postMessage({ type: 'upload', requestId, bridgeUrl, payload });
  return new Promise((resolve, reject) => {
    pendingUploads.set(requestId, { resolve, reject });
  });
}

function stripArtifactData(artifact) {
  const clone = {};
  for (const key in artifact) clone[key] = artifact[key];
  delete clone.dataBase64;
  delete clone.text;
  delete clone.json;
  return clone;
}

function uniqueById(items) {
  const map = new Map();
  for (const item of items) if (item.id) map.set(item.id, item);
  const result = [];
  map.forEach((value) => result.push(value));
  return result;
}

function assignArtifactResult(artifact, relativePath) {
  const clone = {};
  for (const key in artifact) clone[key] = artifact[key];
  clone.relativePath = relativePath;
  return clone;
}

function colorToCss(color, opacity = 1) {
  const a = typeof color.a === 'number' ? color.a * opacity : opacity;
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (a >= 0.999) return '#' + [r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `rgba(${r}, ${g}, ${b}, ${round(a)})`;
}

function lineHeightToPx(lineHeight, fontSize) {
  if (!lineHeight || lineHeight.unit === 'AUTO') return undefined;
  if (lineHeight.unit === 'PIXELS') return round(lineHeight.value);
  if (lineHeight.unit === 'PERCENT' && typeof fontSize === 'number') return round(fontSize * lineHeight.value / 100);
  return undefined;
}

function letterSpacingToPx(letterSpacing, fontSize) {
  if (!letterSpacing) return undefined;
  if (letterSpacing.unit === 'PIXELS') return round(letterSpacing.value);
  if (letterSpacing.unit === 'PERCENT' && typeof fontSize === 'number') return round(fontSize * letterSpacing.value / 100);
  return undefined;
}

function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b1 = bytes[index];
    const hasB2 = index + 1 < bytes.length;
    const hasB3 = index + 2 < bytes.length;
    const b2 = hasB2 ? bytes[index + 1] : 0;
    const b3 = hasB3 ? bytes[index + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += hasB2 ? chars[(triplet >> 6) & 63] : '=';
    output += hasB3 ? chars[triplet & 63] : '=';
  }
  return output;
}

function safeName(value) {
  return String(value).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'asset';
}

function compact(object) {
  const clean = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    clean[key] = value;
  }
  return clean;
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function notify(message, level, done = false) {
  figma.ui.postMessage({ type: 'status', message, level, done });
}
