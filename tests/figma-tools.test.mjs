import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFigmaTarget, figmaNodeIdToFileName } from '../scripts/figma-tools/figma-api.mjs';
import {
  collectAssetCandidates,
  figmaColorToCss,
  flattenVisibleNodes,
  nodeToManifest,
  summarizeManifest,
} from '../scripts/figma-tools/figma-analyzer.mjs';
import { buildCssStyleForNode, generatePreviewHtml } from '../scripts/figma-tools/preview-generator.mjs';

test('parseFigmaTarget extracts file key and node id from design URLs', () => {
  const target = parseFigmaTarget('https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/Sample-File?node-id=0-1&t=example');

  assert.deepEqual(target, {
    fileKey: 'AbCdEfGhIjKlMnOpQrStUv',
    nodeId: '0:1',
  });
});

test('figmaNodeIdToFileName creates filesystem-safe deterministic names', () => {
  assert.equal(figmaNodeIdToFileName('12:345;7'), '12-345-7');
});

test('figmaColorToCss converts Figma RGBA paint to CSS rgba with rounded channels', () => {
  assert.equal(
    figmaColorToCss({ r: 0.25, g: 0.5, b: 1, a: 0.75 }),
    'rgba(64, 128, 255, 0.75)',
  );
});

test('flattenVisibleNodes skips hidden nodes and returns descendants in paint order', () => {
  const root = {
    id: 'root',
    name: 'Root',
    type: 'FRAME',
    visible: true,
    children: [
      { id: 'a', name: 'A', type: 'RECTANGLE', visible: false },
      { id: 'b', name: 'B', type: 'FRAME', children: [{ id: 'c', name: 'C', type: 'TEXT' }] },
    ],
  };

  assert.deepEqual(flattenVisibleNodes(root).map((node) => node.id), ['root', 'b', 'c']);
});

test('collectAssetCandidates finds image fills and vector export candidates', () => {
  const root = {
    id: 'root',
    name: 'Root',
    type: 'FRAME',
    children: [
      {
        id: 'img:1',
        name: 'Hero Image',
        type: 'RECTANGLE',
        fills: [{ type: 'IMAGE', visible: true, imageRef: 'abc123', scaleMode: 'FILL' }],
        absoluteBoundingBox: { x: 10, y: 20, width: 320, height: 180 },
      },
      {
        id: 'icon:1',
        name: 'Search Icon',
        type: 'VECTOR',
        absoluteBoundingBox: { x: 40, y: 60, width: 24, height: 24 },
      },
    ],
  };

  const assets = collectAssetCandidates(root);

  assert.deepEqual(assets.imageRefs, [{ imageRef: 'abc123', nodeId: 'img:1', nodeName: 'Hero Image' }]);
  assert.deepEqual(assets.svgNodes, [{ nodeId: 'icon:1', nodeName: 'Search Icon', type: 'VECTOR' }]);
});

test('nodeToManifest captures geometry, typography, colors, radii and local asset refs', () => {
  const root = {
    id: 'root',
    name: 'Screen',
    type: 'FRAME',
    absoluteBoundingBox: { x: 100, y: 50, width: 390, height: 844 },
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.02, g: 0.03, b: 0.04 }, opacity: 1 }],
    cornerRadius: 24,
    children: [
      {
        id: 'title',
        name: 'Title',
        type: 'TEXT',
        characters: 'Hello',
        absoluteBoundingBox: { x: 124, y: 82, width: 120, height: 36 },
        style: { fontFamily: 'Rajdhani', fontSize: 24, fontWeight: 700, lineHeightPx: 30, textAlignHorizontal: 'LEFT' },
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      },
    ],
  };

  const manifest = nodeToManifest(root, {
    fileKey: 'file123',
    rootId: 'root',
    assetMap: new Map(),
  });

  assert.equal(manifest.root.size.width, 390);
  assert.equal(manifest.nodes[0].radius, 24);
  assert.equal(manifest.nodes[1].text, 'Hello');
  assert.equal(manifest.nodes[1].font.family, 'Rajdhani');
  assert.equal(manifest.nodes[1].box.x, 24);
});

test('summarizeManifest extracts reusable design inventory', () => {
  const summary = summarizeManifest({
    nodes: [
      { type: 'FRAME', fill: '#000000', radius: 16, box: { width: 100, height: 100 } },
      { type: 'TEXT', fill: '#ffffff', font: { family: 'Rajdhani', size: 18, weight: 700 } },
      { type: 'TEXT', fill: '#ffffff', font: { family: 'Rajdhani', size: 18, weight: 700 } },
    ],
    components: [{ id: 'comp', name: 'Button' }],
  });

  assert.deepEqual(summary.colors, ['#000000', '#ffffff']);
  assert.deepEqual(summary.radii, [16]);
  assert.deepEqual(summary.typography, ['Rajdhani / 18px / 700']);
  assert.equal(summary.components.length, 1);
});

test('buildCssStyleForNode returns absolute CSS preserving text styling', () => {
  const css = buildCssStyleForNode({
    id: 'title',
    type: 'TEXT',
    box: { x: 10, y: 20, width: 200, height: 40 },
    fill: '#ffffff',
    opacity: 0.8,
    font: { family: 'Space Grotesk', size: 32, weight: 900, lineHeight: 36, align: 'CENTER' },
  });

  assert.match(css, /left:10px/);
  assert.match(css, /font-family:"Space Grotesk"/);
  assert.match(css, /text-align:center/);
  assert.match(css, /opacity:0.8/);
});

test('generatePreviewHtml emits a local asset backed preview document', () => {
  const html = generatePreviewHtml({
    fileKey: 'file123',
    root: { id: 'root', name: 'Root', size: { width: 100, height: 100 } },
    nodes: [
      { id: 'root', name: 'Root', type: 'FRAME', box: { x: 0, y: 0, width: 100, height: 100 }, fill: '#000000' },
      { id: 'hero', name: 'Hero', type: 'RECTANGLE', box: { x: 10, y: 10, width: 80, height: 40 }, asset: { kind: 'image', publicPath: '../../public/figma-assets/images/hero.png' } },
    ],
    summary: { colors: ['#000000'], typography: [], radii: [], components: [] },
  });

  assert.match(html, /<main class="figma-stage"/);
  assert.match(html, /public\/figma-assets\/images\/hero.png/);
  assert.match(html, /data-figma-id="hero"/);
});

import {
  detectImageExtension,
  normalizePluginPayloadToManifest,
  pluginArtifactPublicPath,
  sanitizeFileName,
} from '../scripts/figma-tools/plugin-payload.mjs';

test('detectImageExtension detects common image signatures without trusting file names', () => {
  assert.equal(detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47])), '.png');
  assert.equal(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00])), '.jpg');
  assert.equal(detectImageExtension(Buffer.from('RIFFxxxxWEBP')), '.webp');
  assert.equal(detectImageExtension(Buffer.from('<svg viewBox="0 0 1 1"></svg>')), '.svg');
});

test('sanitizeFileName preserves readable CJK names while removing unsafe path characters', () => {
  assert.equal(sanitizeFileName('0:1/首页 Hero?*'), '0-1-首页-Hero');
});

test('pluginArtifactPublicPath maps ingested artifacts to preview-relative public paths', () => {
  assert.equal(
    pluginArtifactPublicPath('images/hero.png'),
    '../../public/figma-assets/images/hero.png',
  );
});

test('normalizePluginPayloadToManifest keeps exact-export assets and editable node geometry', () => {
  const manifest = normalizePluginPayloadToManifest({
    fileKey: 'plugin-file',
    source: { pageName: 'Page 1' },
    roots: [{ id: 'frame:1', name: '首页', type: 'FRAME', absoluteBox: { x: 100, y: 200, width: 390, height: 844 } }],
    nodes: [
      {
        id: 'frame:1', name: '首页', type: 'FRAME', absoluteBox: { x: 100, y: 200, width: 390, height: 844 }, fills: [{ type: 'SOLID', color: '#020406' }], cornerRadius: 24,
      },
      {
        id: 'text:1', name: '标题', type: 'TEXT', text: 'METAWAR', absoluteBox: { x: 124, y: 230, width: 200, height: 40 }, fills: [{ type: 'SOLID', color: '#ffffff' }], font: { family: 'Space Grotesk', size: 32, weight: 900, lineHeight: 36, align: 'LEFT' },
      },
      {
        id: 'image:1', name: '人物', type: 'RECTANGLE', absoluteBox: { x: 180, y: 300, width: 100, height: 200 }, imageHash: 'abc123', fills: [{ type: 'IMAGE', imageHash: 'abc123' }],
      },
    ],
    artifacts: [
      { kind: 'image', nodeId: 'image:1', imageHash: 'abc123', relativePath: 'images/abc123.png' },
      { kind: 'root-svg', nodeId: 'frame:1', relativePath: 'frames/frame-1.svg' },
      { kind: 'root-png', nodeId: 'frame:1', relativePath: 'frames/frame-1@4x.png', scale: 4 },
    ],
  });

  assert.equal(manifest.root.name, '首页');
  assert.equal(manifest.nodes.find((node) => node.id === 'text:1').box.x, 24);
  assert.equal(manifest.nodes.find((node) => node.id === 'image:1').asset.publicPath, '../../public/figma-assets/images/abc123.png');
  assert.equal(manifest.exactExports.svg.publicPath, '../../public/figma-assets/frames/frame-1.svg');
  assert.equal(manifest.exactExports.png.publicPath, '../../public/figma-assets/frames/frame-1@4x.png');
});

import {
  compareImages,
  createSolidImage,
  diffImages,
  imageFromPixels,
  renderVisualReportMarkdown,
} from '../scripts/figma-tools/visual-diff.mjs';
import {
  applyPixelLockFallback,
  shouldUsePixelLockFallback,
} from '../scripts/figma-tools/auto-tune.mjs';

test('compareImages returns 100 similarity for identical images', () => {
  const baseline = createSolidImage(2, 2, [255, 0, 0, 255]);
  const actual = createSolidImage(2, 2, [255, 0, 0, 255]);

  const result = compareImages(baseline, actual);

  assert.equal(result.similarity, 100);
  assert.equal(result.changedPixels, 0);
});

test('compareImages scores visible pixel differences and identifies regions', () => {
  const baseline = createSolidImage(2, 2, [255, 255, 255, 255]);
  const actual = imageFromPixels(2, 2, [
    [255, 255, 255, 255], [0, 0, 0, 255],
    [255, 255, 255, 255], [255, 255, 255, 255],
  ]);

  const result = compareImages(baseline, actual);

  assert.equal(result.changedPixels, 1);
  assert.ok(result.similarity < 100);
  assert.deepEqual(result.boundingBox, { x: 1, y: 0, width: 1, height: 1 });
});

test('diffImages emits red heatmap pixels where images differ', () => {
  const baseline = createSolidImage(1, 1, [255, 255, 255, 255]);
  const actual = createSolidImage(1, 1, [0, 0, 0, 255]);

  const diff = diffImages(baseline, actual);

  assert.deepEqual([...diff.data], [255, 0, 64, 255]);
});

test('renderVisualReportMarkdown summarizes score and recommendations', () => {
  const markdown = renderVisualReportMarkdown({
    similarity: 92.4,
    threshold: 95,
    changedPixels: 120,
    totalPixels: 1000,
    boundingBox: { x: 10, y: 20, width: 40, height: 50 },
    recommendations: ['Enable pixel-lock fallback for complex layers.'],
  });

  assert.match(markdown, /92\.40%/);
  assert.match(markdown, /未达标/);
  assert.match(markdown, /Enable pixel-lock fallback/);
});

test('applyPixelLockFallback marks manifest and preview config as pixel-lock-first', () => {
  const manifest = {
    exactExports: { svg: { publicPath: '../../public/figma-assets/frames/root.svg' } },
    nodes: [],
  };

  const tuned = applyPixelLockFallback(manifest, { reason: 'score below threshold', similarity: 88.5, threshold: 95 });

  assert.equal(tuned.previewMode, 'pixel-lock-first');
  assert.equal(tuned.tuning.applied[0].strategy, 'pixel-lock-fallback');
  assert.equal(tuned.tuning.applied[0].similarityBefore, 88.5);
});

test('shouldUsePixelLockFallback only triggers when score is below threshold and exact export exists', () => {
  assert.equal(shouldUsePixelLockFallback({ similarity: 94.9, threshold: 95 }, { exactExports: { png: { publicPath: 'x' } } }), true);
  assert.equal(shouldUsePixelLockFallback({ similarity: 96, threshold: 95 }, { exactExports: { png: { publicPath: 'x' } } }), false);
  assert.equal(shouldUsePixelLockFallback({ similarity: 94, threshold: 95 }, { exactExports: {} }), false);
});

import { buildFrontendToFigmaPayload } from '../scripts/frontend-to-figma-payload.mjs';

test('buildFrontendToFigmaPayload converts local pen frames into Figma import roots', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'figma-pixel-bridge-'));
  try {
    await writeFile(path.join(cwd, 'fixture.pen'), JSON.stringify({
      children: [
        {
          id: 'home',
          type: 'frame',
          name: 'Home Overview',
          x: 0,
          y: 0,
          width: 1440,
          height: 900,
          children: [
            { id: 'title', type: 'text', name: 'Title', x: 32, y: 48, width: 240, height: 48, content: 'Hello', fontFamily: 'Space Grotesk', fontSize: 32, fontWeight: 700 },
          ],
        },
      ],
    }), 'utf8');

    const payload = await buildFrontendToFigmaPayload({ cwd, penFile: 'fixture.pen', includeImages: false });

    assert.equal(payload.roots[0].type, 'FRAME');
    assert.equal(payload.roots[0].width, 1440);
    assert.ok(payload.roots.some((root) => root.name.includes('Home')));
    assert.ok(payload.roots.flatMap((root) => root.children ?? []).some((node) => node.type === 'TEXT'));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
