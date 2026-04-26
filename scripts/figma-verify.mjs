#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareImages, diffImages, readImage, writeVisualReport } from './figma-tools/visual-diff.mjs';

export async function runVisualVerify(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const threshold = Number(options.threshold ?? process.env.FIGMA_VISUAL_THRESHOLD ?? 95);
  const reportDir = options.reportDir ?? path.join(cwd, 'reports', 'figma-visual-diff');
  const manifestPath = options.manifestPath ?? path.join(cwd, 'public', 'figma-assets', 'design-manifest.json');
  const manifest = options.manifest ?? JSON.parse(await readFile(manifestPath, 'utf8'));
  const baselinePath = resolveProjectPath(cwd, options.baseline ?? bestBaseline(manifest));
  if (!baselinePath) throw new Error('No baseline found. Run the Figma plugin export first so exactExports.png/svg exists.');

  const actualPath = resolveProjectPath(cwd, options.actual ?? bestActual(manifest, baselinePath));
  if (!actualPath) throw new Error('No actual image found. Provide --actual image, or run auto-tune/pixel-lock mode.');

  const baseline = await readImage(baselinePath);
  const actual = await readImage(actualPath);
  const comparison = compareImages(baseline, actual, { threshold });
  comparison.inputs = { baselinePath, actualPath, manifestPath };
  const diff = diffImages(baseline, actual);
  const reportPaths = await writeVisualReport({ reportDir, baseline, actual, comparison, diff });
  return { ...comparison, reportDir, reportPaths };
}

function bestBaseline(manifest) {
  return manifest?.exactExports?.png?.publicPath ?? manifest?.exactExports?.svg?.publicPath;
}

function bestActual(manifest, baselinePath) {
  // Pixel-lock-first preview renders the exact exported asset as the visual layer, so the exported asset is the actual render target.
  if (manifest?.previewMode === 'pixel-lock-first') return manifest?.exactExports?.png?.publicPath ?? manifest?.exactExports?.svg?.publicPath ?? baselinePath;
  return process.env.FIGMA_ACTUAL_IMAGE || '';
}

function resolveProjectPath(cwd, value) {
  if (!value) return '';
  if (path.isAbsolute(value)) return value;
  const cleaned = String(value).replace(/^\.\.\/\.\.\/public\//, 'public/').replace(/^\.\//, '');
  return path.join(cwd, cleaned);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--baseline') options.baseline = argv[++index];
    else if (arg === '--actual') options.actual = argv[++index];
    else if (arg === '--threshold') options.threshold = Number(argv[++index]);
    else if (arg === '--manifest') options.manifestPath = argv[++index];
    else if (arg === '--report-dir') options.reportDir = argv[++index];
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runVisualVerify(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(`[figma-verify] similarity ${result.similarity}% (${result.pass ? 'PASS' : 'FAIL'})`);
    console.log(`[figma-verify] report ${result.reportPaths.markdown}`);
    process.exitCode = result.pass ? 0 : 2;
  }).catch((error) => {
    console.error(`[figma-verify] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
