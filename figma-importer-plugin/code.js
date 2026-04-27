figma.showUI(__html__, { width: 440, height: 660, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'import-payload') return;
  try {
    await importPayload(msg.payload, msg.options || {});
  } catch (error) {
    notify(`导入失败：${error.message || error}`);
    figma.ui.postMessage({ type: 'done', message: '导入失败，详情见上方日志。' });
  }
};

async function importPayload(payload, options) {
  if (!payload || !payload.roots || !payload.roots.length) throw new Error('payload 中没有 roots');
  notify(`开始导入 ${payload.roots.length} 个画板...`);
  const assetImages = await createAssetImages((payload.assets || []));
  const targetPage = options.newPage ? figma.createPage() : figma.currentPage;
  if (options.newPage) {
    targetPage.name = `Figma Pixel Bridge import ${new Date().toLocaleString('zh-CN')}`;
    figma.currentPage = targetPage;
  }

  const createdRoots = [];
  for (const root of payload.roots) {
    const node = await createNode(root, assetImages, null);
    targetPage.appendChild(node);
    createdRoots.push(node);
    notify(`已创建：${root.name}`);
  }

  figma.viewport.scrollAndZoomIntoView(createdRoots);
  figma.currentPage.selection = createdRoots.slice(0, 1);
  notify(`完成：${createdRoots.length} 个顶层画板，${((payload.assets && payload.assets.length) || 0)} 个图片资源。`);
  figma.ui.postMessage({ type: 'done', message: '导入完成。' });
}

async function createAssetImages(assets) {
  const map = new Map();
  for (const asset of assets) {
    if (!asset.key || !asset.dataBase64) continue;
    try {
      const bytes = base64ToUint8Array(asset.dataBase64);
      map.set(asset.key, await createFigmaImage(bytes));
    } catch (error) {
      notify(`图片资源失败 ${asset.key}: ${error.message}`);
    }
  }
  return map;
}

async function createNode(model, assetImages, parent) {
  let node;
  if (model.type === 'FRAME') {
    node = figma.createFrame();
    node.clipsContent = model.clip !== false;
    node.fills = model.fill ? [solidPaint(model.fill)] : [];
  } else if (model.type === 'TEXT') {
    node = figma.createText();
    await applyText(node, model);
  } else if (model.type === 'IMAGE') {
    node = figma.createRectangle();
    const image = assetImages.get(model.imageKey);
    node.fills = image ? [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash, opacity: (typeof model.opacity === 'number' ? model.opacity : 1) }] : [];
  } else if (model.type === 'LINE') {
    node = figma.createRectangle();
    node.fills = [solidPaint(model.fill || (model.stroke && model.stroke.color) || '#FFFFFF')];
  } else {
    node = figma.createRectangle();
    node.fills = model.fill ? [solidPaint(model.fill)] : [];
  }

  node.name = model.name || model.id || model.type;
  setGeometry(node, model);
  applyStroke(node, model.stroke);
  applyRadius(node, model.radius);
  if (typeof model.rotation === 'number') node.rotation = model.rotation;

  if ('children' in node && (model.children && model.children.length)) {
    for (const child of model.children) {
      const childNode = await createNode(child, assetImages, node);
      node.appendChild(childNode);
    }
  }
  return node;
}

function setGeometry(node, model) {
  node.x = finite(model.x, 0);
  node.y = finite(model.y, 0);
  const width = finite(model.width, model.type === 'TEXT' ? 1 : 100);
  const height = finite(model.height, model.type === 'TEXT' ? 1 : 100);
  if (model.type === 'TEXT') {
    if (width > 1) node.resizeWithoutConstraints(width, Math.max(height, model.fontSize || 12));
    return;
  }
  if (model.type === 'LINE') {
    node.resizeWithoutConstraints(Math.max(width, 1), Math.max(height, 1));
    return;
  }
  node.resizeWithoutConstraints(Math.max(width, 1), Math.max(height, 1));
}

async function applyText(node, model) {
  const fontName = await loadBestFont(model.fontFamily, model.fontWeight);
  node.fontName = fontName;
  if (model.fontSize) node.fontSize = model.fontSize;
  node.characters = String(model.text || '');
  node.fills = model.fill ? [solidPaint(model.fill)] : [solidPaint('#FFFFFF')];
  node.textAutoResize = 'WIDTH_AND_HEIGHT';
}

async function loadBestFont(family, weight) {
  const requested = family || 'Inter';
  const weightNumber = Number(weight || 400);
  const styles = weightNumber >= 850
    ? ['Black', 'ExtraBold', 'Bold', 'SemiBold', 'Regular']
    : weightNumber >= 700
      ? ['Bold', 'SemiBold', 'Medium', 'Regular']
      : weightNumber >= 600
        ? ['SemiBold', 'Medium', 'Bold', 'Regular']
        : ['Regular', 'Medium', 'Light'];
  const families = [requested, 'Inter', 'Arial'];
  for (const fam of families) {
    for (const style of styles) {
      try {
        const font = { family: fam, style };
        await figma.loadFontAsync(font);
        return font;
      } catch (error) {}
    }
  }
  const fallback = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(fallback);
  return fallback;
}

function applyStroke(node, stroke) {
  if (!stroke || !('strokes' in node)) return;
  const color = stroke.color || '#FFFFFF';
  node.strokes = [solidPaint(color)];
  node.strokeWeight = finite(stroke.thickness, 1);
  if ('strokeAlign' in node && stroke.align === 'inside') node.strokeAlign = 'INSIDE';
}

function applyRadius(node, radius) {
  if (typeof radius === 'number' && 'cornerRadius' in node) node.cornerRadius = radius;
}

function solidPaint(hex) {
  const parsed = parseHex(hex || '#000000');
  return { type: 'SOLID', color: { r: parsed.r, g: parsed.g, b: parsed.b }, opacity: parsed.a };
}

function parseHex(hex) {
  let clean = String(hex).trim();
  if (!clean.startsWith('#')) clean = '#000000';
  clean = clean.slice(1);
  if (clean.length === 3 || clean.length === 4) clean = clean.split('').map((char) => char + char).join('');
  const r = parseInt(clean.slice(0, 2) || '00', 16) / 255;
  const g = parseInt(clean.slice(2, 4) || '00', 16) / 255;
  const b = parseInt(clean.slice(4, 6) || '00', 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function base64ToUint8Array(base64) {
  if (typeof figma.base64Decode === 'function') return figma.base64Decode(base64);
  const clean = String(base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let index = 0;
  while (index < clean.length) {
    const enc1 = chars.indexOf(clean.charAt(index++));
    const enc2 = chars.indexOf(clean.charAt(index++));
    const enc3 = chars.indexOf(clean.charAt(index++));
    const enc4 = chars.indexOf(clean.charAt(index++));
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    output += String.fromCharCode(chr1);
    if (enc3 !== 64) output += String.fromCharCode(chr2);
    if (enc4 !== 64) output += String.fromCharCode(chr3);
  }
  const binary = output;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createFigmaImage(bytes) {
  if (typeof figma.createImage === 'function') return figma.createImage(bytes);
  if (typeof figma.createImageAsync === 'function') return await figma.createImageAsync(bytes);
  throw new Error('Figma 当前运行时没有图片创建 API');
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function notify(message) {
  figma.ui.postMessage({ type: 'status', message });
}
