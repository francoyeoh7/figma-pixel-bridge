#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPixelLockFallback, shouldUsePixelLockFallback } from './figma-tools/auto-tune.mjs';
import { generatePreviewHtml } from './figma-tools/preview-generator.mjs';
import { runVisualVerify } from './figma-verify.mjs';

export async function runAutoTune(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const threshold = Number(options.threshold ?? process.env.FIGMA_VISUAL_THRESHOLD ?? 95);
  const manifestPath = options.manifestPath ?? path.join(cwd, 'public', 'figma-assets', 'design-manifest.json');
  const previewDir = options.previewDir ?? path.join(cwd, 'generated', 'figma-preview');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  let comparison;
  try {
    comparison = await runVisualVerify({ cwd, threshold, manifest, manifestPath, actual: options.actual, reportDir: options.reportDir });
  } catch (error) {
    comparison = { similarity: 0, threshold, pass: false, error: error.message };
  }

  let tunedManifest = manifest;
  let tuned = false;
  if (shouldUsePixelLockFallback(comparison, manifest)) {
    tunedManifest = applyPixelLockFallback(manifest, {
      reason: comparison.error || 'editable reconstruction below visual threshold',
      similarity: comparison.similarity,
      threshold,
    });
    tuned = true;
    await mkdir(previewDir, { recursive: true });
    await writeFile(path.join(previewDir, 'tuned-manifest.json'), `${JSON.stringify(tunedManifest, null, 2)}\n`, 'utf8');
    await writeFile(path.join(previewDir, 'design-manifest.json'), `${JSON.stringify(tunedManifest, null, 2)}\n`, 'utf8');
    await writeFile(path.join(previewDir, 'index.html'), generatePreviewHtml(tunedManifest), 'utf8');
    await writeFile(manifestPath, `${JSON.stringify(tunedManifest, null, 2)}\n`, 'utf8');
    comparison = await runVisualVerify({ cwd, threshold, manifest: tunedManifest, manifestPath, reportDir: options.reportDir });
  }

  return {
    tuned,
    pass: comparison.pass,
    similarity: comparison.similarity,
    threshold,
    reportPaths: comparison.reportPaths,
    previewPath: path.join(previewDir, 'index.html'),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--actual') options.actual = argv[++index];
    else if (arg === '--threshold') options.threshold = Number(argv[++index]);
    else if (arg === '--manifest') options.manifestPath = argv[++index];
    else if (arg === '--report-dir') options.reportDir = argv[++index];
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runAutoTune(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(`[figma-auto-tune] similarity ${result.similarity}% (${result.pass ? 'PASS' : 'FAIL'})`);
    console.log(`[figma-auto-tune] tuned ${result.tuned ? 'yes' : 'no'}`);
    console.log(`[figma-auto-tune] preview ${result.previewPath}`);
    if (result.reportPaths?.markdown) console.log(`[figma-auto-tune] report ${result.reportPaths.markdown}`);
    process.exitCode = result.pass ? 0 : 2;
  }).catch((error) => {
    console.error(`[figma-auto-tune] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
