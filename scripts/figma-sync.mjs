#!/usr/bin/env node
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FIGMA_URL,
  downloadUrlToFile,
  exportFigmaNodes,
  extensionFromContentType,
  figmaNodeIdToFileName,
  getFigmaFile,
  getFigmaImageFills,
  getFigmaNodes,
  loadFigmaConfig,
  pickRootNode,
  writeJson,
} from './figma-tools/figma-api.mjs';
import { analyzeFigmaDocument, assetFileBase, collectAssetCandidates } from './figma-tools/figma-analyzer.mjs';
import { generatePreviewHtml } from './figma-tools/preview-generator.mjs';

const DEFAULT_ROOT = process.cwd();

export async function runFigmaSync(options = {}) {
  const cwd = options.cwd ?? DEFAULT_ROOT;
  const config = await loadFigmaConfig({
    cwd,
    overrides: {
      token: options.token,
      fileKey: options.fileKey,
      nodeId: options.nodeId,
      figmaUrl: options.figmaUrl ?? DEFAULT_FIGMA_URL,
    },
  });

  const output = createOutputPaths(cwd, config);
  await mkdir(output.cacheDir, { recursive: true });
  await mkdir(output.assetsDir, { recursive: true });
  await mkdir(output.previewDir, { recursive: true });

  const previousFileJson = await readJsonIfExists(output.rawFileJson);
  log(options, `Fetching Figma file ${config.fileKey}${config.nodeId ? ` node ${config.nodeId}` : ''}`);
  const fileJson = await fetchHydratedFileJson(config, (message) => log(options, message));
  const canReuseCachedAssets = options.reuseCachedAssets !== false && isFreshFigmaSnapshot(previousFileJson, fileJson);
  await writeJson(output.rawFileJson, fileJson);

  const rootNode = pickRootNode(fileJson, config.nodeId);
  if (!rootNode) {
    throw new Error(`Could not find root node ${config.nodeId || '(document)'} in Figma response`);
  }

  const candidates = collectAssetCandidates(rootNode);
  const assetMap = new Map();
  const assetLog = { images: [], svgs: [], frames: [] };

  if (options.downloadAssets !== false) {
    if (canReuseCachedAssets) log(options, 'Reusing unchanged local Figma asset exports');
    await exportOriginalImageFills({ config, candidates, output, assetMap, assetLog, canReuseCachedAssets, log: (message) => log(options, message) });
    await exportSvgNodes({ config, candidates, output, assetMap, assetLog, canReuseCachedAssets, log: (message) => log(options, message) });
    await exportFramePngs({ config, rootNode, candidates, output, assetMap, assetLog, canReuseCachedAssets, log: (message) => log(options, message) });
  }

  const manifest = analyzeFigmaDocument(fileJson, {
    rootNode,
    rootId: config.nodeId || rootNode.id,
    fileKey: config.fileKey,
    assetMap,
  });
  manifest.source = {
    figmaUrl: config.figmaUrl,
    fileKey: config.fileKey,
    nodeId: config.nodeId || rootNode.id,
  };
  manifest.exports = assetLog;
  manifest.preview = {
    ...(manifest.preview ?? {}),
    ...(options.autoInteractions ? { autoInteractions: true } : {}),
    ...(options.interactionProfile ? { interactionProfile: options.interactionProfile } : {}),
  };

  await writeJson(output.manifestJson, manifest);
  await writeJson(output.previewManifestJson, manifest);

  if (options.generatePreview !== false) {
    const html = generatePreviewHtml(manifest);
    await writeFile(output.previewHtml, html, 'utf8');
  }

  const summary = {
    fileKey: config.fileKey,
    nodeId: config.nodeId || rootNode.id,
    rootName: rootNode.name,
    manifestPath: output.manifestJson,
    previewPath: output.previewHtml,
    assetsDir: output.assetsDir,
    counts: {
      nodes: manifest.nodes.length,
      components: manifest.components.length,
      colors: manifest.summary.colors.length,
      typography: manifest.summary.typography.length,
      imageCandidates: candidates.imageRefs.length,
      svgCandidates: candidates.svgNodes.length,
      frameCandidates: candidates.frameNodes.length,
      imagesDownloaded: assetLog.images.length,
      svgsDownloaded: assetLog.svgs.length,
      framesDownloaded: assetLog.frames.length,
      cachedAssetsReused: assetLog.images.filter((asset) => asset.cached).length
        + assetLog.svgs.filter((asset) => asset.cached).length
        + assetLog.frames.filter((asset) => asset.cached).length,
    },
  };

  await writeJson(output.syncSummaryJson, summary);
  return summary;
}

async function fetchHydratedFileJson(config, log) {
  const shallowFile = await getFigmaFile({ ...config, depth: 2 });
  const rootNode = pickRootNode(shallowFile, config.nodeId);
  if (!rootNode) return shallowFile;

  if (rootNode.type === 'CANVAS' || rootNode.type === 'DOCUMENT') {
    const topLevelIds = rootNode.type === 'DOCUMENT'
      ? (rootNode.children ?? []).flatMap((page) => (page.children ?? []).map((child) => child.id))
      : (rootNode.children ?? []).map((child) => child.id);
    if (topLevelIds.length) {
      log(`Hydrating ${topLevelIds.length} top-level Figma node(s)`);
      const hydrated = await fetchNodeDocuments(config, topLevelIds);
      replaceNodesById(shallowFile.document, hydrated);
    }
    return shallowFile;
  }

  if (!rootNode.children?.length) {
    log(`Hydrating selected Figma node ${rootNode.id}`);
    const hydrated = await fetchNodeDocuments(config, [rootNode.id]);
    replaceNodesById(shallowFile.document, hydrated);
  }
  return shallowFile;
}

async function fetchNodeDocuments(config, nodeIds) {
  const docs = new Map();
  for (const batchIds of chunk(nodeIds, 20)) {
    const response = await getFigmaNodes({ ...config, nodeIds: batchIds });
    for (const [nodeId, payload] of Object.entries(response.nodes ?? {})) {
      if (payload?.document) docs.set(nodeId, payload.document);
    }
  }
  return docs;
}

function replaceNodesById(node, replacements) {
  if (!node?.children?.length) return;
  node.children = node.children.map((child) => {
    const replacement = replacements.get(child.id);
    if (replacement) return replacement;
    replaceNodesById(child, replacements);
    return child;
  });
}

function createOutputPaths(cwd, config) {
  const targetName = `${config.fileKey}-${figmaNodeIdToFileName(config.nodeId || 'document')}`;
  const assetsDir = path.join(cwd, 'public', 'figma-assets');
  const previewDir = path.join(cwd, 'generated', 'figma-preview');
  const cacheDir = path.join(cwd, '.figma-cache');
  return {
    assetsDir,
    previewDir,
    cacheDir,
    imagesDir: path.join(assetsDir, 'images'),
    iconsDir: path.join(assetsDir, 'icons'),
    framesDir: path.join(assetsDir, 'frames'),
    rawFileJson: path.join(cacheDir, `${targetName}.file.json`),
    manifestJson: path.join(assetsDir, 'design-manifest.json'),
    previewManifestJson: path.join(previewDir, 'design-manifest.json'),
    previewHtml: path.join(previewDir, 'index.html'),
    syncSummaryJson: path.join(assetsDir, 'sync-summary.json'),
  };
}

async function exportOriginalImageFills({ config, candidates, output, assetMap, assetLog, canReuseCachedAssets = false, log }) {
  if (!candidates.imageRefs.length) return;
  const pending = [];

  for (const image of candidates.imageRefs) {
    const baseName = `${assetFileBase(image.nodeId, image.nodeName)}-${image.imageRef.slice(0, 8)}`;
    if (canReuseCachedAssets) {
      const cached = await findCachedFileByBase(output.imagesDir, baseName);
      if (cached) {
        const publicPath = `../../public/figma-assets/images/${path.basename(cached.path)}`;
        const asset = { kind: 'image', imageRef: image.imageRef, nodeId: image.nodeId, publicPath, bytes: cached.bytes, cached: true };
        assetMap.set(`image:${image.imageRef}`, asset);
        assetLog.images.push({ ...asset, path: cached.path });
        continue;
      }
    }
    pending.push({ image, baseName });
  }

  if (!pending.length) return;
  log(`Downloading ${pending.length} original image fill(s)`);
  const imageFillResponse = await getFigmaImageFills(config);
  const urls = imageFillResponse?.meta?.images ?? imageFillResponse?.images ?? {};

  for (const { image, baseName } of pending) {
    const url = urls[image.imageRef];
    if (!url) continue;
    const tempPath = path.join(output.imagesDir, `${baseName}.download`);
    const info = await downloadUrlToFile(url, tempPath);
    const ext = extensionFromContentType(info.contentType, '.png');
    const finalPath = path.join(output.imagesDir, `${baseName}${ext}`);
    await rename(tempPath, finalPath).catch(async (error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    const publicPath = `../../public/figma-assets/images/${path.basename(finalPath)}`;
    const asset = { kind: 'image', imageRef: image.imageRef, nodeId: image.nodeId, publicPath, bytes: info.bytes };
    assetMap.set(`image:${image.imageRef}`, asset);
    assetLog.images.push({ ...asset, path: finalPath });
  }
}

async function exportSvgNodes({ config, candidates, output, assetMap, assetLog, canReuseCachedAssets = false, log }) {
  if (!candidates.svgNodes.length) return;
  const pending = [];
  for (const node of candidates.svgNodes) {
    const fileName = `${assetFileBase(node.nodeId, node.nodeName)}.svg`;
    const finalPath = path.join(output.iconsDir, fileName);
    const cached = canReuseCachedAssets ? await fileInfo(finalPath) : null;
    if (cached) {
      const publicPath = `../../public/figma-assets/icons/${fileName}`;
      const asset = { kind: 'svg', nodeId: node.nodeId, publicPath, bytes: cached.bytes, cached: true };
      assetMap.set(`svg:${node.nodeId}`, asset);
      assetLog.svgs.push({ ...asset, path: finalPath });
    } else {
      pending.push(node);
    }
  }
  if (!pending.length) return;
  log(`Exporting ${pending.length} vector/icon node(s) as SVG`);
  for (const batch of chunk(pending, 50)) {
    const exported = await exportFigmaNodes({
      fileKey: config.fileKey,
      token: config.token,
      nodeIds: batch.map((node) => node.nodeId),
      format: 'svg',
    });
    const images = exported.images ?? {};
    for (const node of batch) {
      const url = images[node.nodeId];
      if (!url) continue;
      const fileName = `${assetFileBase(node.nodeId, node.nodeName)}.svg`;
      const finalPath = path.join(output.iconsDir, fileName);
      const info = await downloadUrlToFile(url, finalPath);
      const publicPath = `../../public/figma-assets/icons/${fileName}`;
      const asset = { kind: 'svg', nodeId: node.nodeId, publicPath, bytes: info.bytes };
      assetMap.set(`svg:${node.nodeId}`, asset);
      assetLog.svgs.push({ ...asset, path: finalPath });
    }
  }
}

async function exportFramePngs({ config, rootNode, candidates, output, assetMap, assetLog, canReuseCachedAssets = false, log }) {
  const frameIds = [rootNode.id, ...candidates.frameNodes.map((node) => node.nodeId)];
  const unique = [...new Set(frameIds.filter(Boolean))];
  if (!unique.length) return;
  const pending = [];
  for (const nodeId of unique) {
    const fileName = `${figmaNodeIdToFileName(nodeId)}@4x.png`;
    const finalPath = path.join(output.framesDir, fileName);
    const cached = canReuseCachedAssets ? await fileInfo(finalPath) : null;
    if (cached) {
      const publicPath = `../../public/figma-assets/frames/${fileName}`;
      const asset = { kind: 'png', nodeId, publicPath, bytes: cached.bytes, scale: 4, cached: true };
      assetMap.set(`png:${nodeId}`, asset);
      assetLog.frames.push({ ...asset, path: finalPath });
    } else {
      pending.push(nodeId);
    }
  }
  if (!pending.length) return;
  log(`Exporting ${pending.length} frame/root node(s) as 4x PNG`);
  for (const batchIds of chunk(pending, 25)) {
    const exported = await exportFigmaNodes({
      fileKey: config.fileKey,
      token: config.token,
      nodeIds: batchIds,
      format: 'png',
      scale: 4,
    });
    const images = exported.images ?? {};
    for (const nodeId of batchIds) {
      const url = images[nodeId];
      if (!url) continue;
      const fileName = `${figmaNodeIdToFileName(nodeId)}@4x.png`;
      const finalPath = path.join(output.framesDir, fileName);
      const info = await downloadUrlToFile(url, finalPath);
      const publicPath = `../../public/figma-assets/frames/${fileName}`;
      const asset = { kind: 'png', nodeId, publicPath, bytes: info.bytes, scale: 4 };
      assetMap.set(`png:${nodeId}`, asset);
      assetLog.frames.push({ ...asset, path: finalPath });
    }
  }
}

export function isFreshFigmaSnapshot(previousFileJson, nextFileJson) {
  if (!previousFileJson || !nextFileJson) return false;
  const previousKey = previousFileJson.key ?? previousFileJson.fileKey ?? '';
  const nextKey = nextFileJson.key ?? nextFileJson.fileKey ?? '';
  if (previousKey && nextKey && previousKey !== nextKey) return false;
  const previousModified = previousFileJson.lastModified ?? previousFileJson.last_modified ?? '';
  const nextModified = nextFileJson.lastModified ?? nextFileJson.last_modified ?? '';
  const previousVersion = previousFileJson.version ?? '';
  const nextVersion = nextFileJson.version ?? '';
  if (previousModified && nextModified) return previousModified === nextModified && (!previousVersion || !nextVersion || previousVersion === nextVersion);
  return Boolean(previousVersion && nextVersion && previousVersion === nextVersion);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function fileInfo(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? { path: filePath, bytes: info.size } : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function findCachedFileByBase(dir, baseName) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.startsWith(`${baseName}.`) || entry.endsWith('.download')) continue;
    const info = await fileInfo(path.join(dir, entry));
    if (info) return info;
  }
  return null;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

function log(options, message) {
  if (options.quiet) return;
  console.log(`[figma-sync] ${message}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runFigmaSync().then((summary) => {
    console.log('[figma-sync] complete');
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(`[figma-sync] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
