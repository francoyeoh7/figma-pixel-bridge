#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFigmaSync } from './figma-sync.mjs';
import { runAutoTune } from './figma-auto-tune.mjs';
import { runVisualVerify } from './figma-verify.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'help';
const args = process.argv.slice(3);

try {
  if (['help', '-h', '--help'].includes(command)) {
    printHelp();
  } else if (command === 'sync') {
    const options = parseOptions(args);
    const summary = await runFigmaSync({
      cwd: options.cwd || process.cwd(),
      figmaUrl: options.url || options.figmaUrl,
      fileKey: options.fileKey,
      nodeId: options.nodeId,
      token: options.token,
      downloadAssets: options.assets !== false,
      generatePreview: options.preview !== false,
      reuseCachedAssets: options.cache !== false,
      autoInteractions: options.autoInteractions === true,
      interactionProfile: options.interactionProfile,
    });
    console.log(JSON.stringify(summary, null, 2));
  } else if (command === 'verify') {
    const options = parseOptions(args);
    const result = await runVisualVerify({
      cwd: options.cwd || process.cwd(),
      threshold: options.threshold,
      baseline: options.baseline,
      actual: options.actual,
      manifestPath: options.manifest,
      reportDir: options.reportDir,
    });
    console.log(`[figma-pixel] similarity ${result.similarity}% (${result.pass ? 'PASS' : 'FAIL'})`);
    console.log(`[figma-pixel] report ${result.reportPaths.markdown}`);
    process.exitCode = result.pass ? 0 : 2;
  } else if (command === 'auto-tune') {
    const options = parseOptions(args);
    const result = await runAutoTune({
      cwd: options.cwd || process.cwd(),
      threshold: options.threshold,
      actual: options.actual,
      manifestPath: options.manifest,
      reportDir: options.reportDir,
    });
    console.log(`[figma-pixel] similarity ${result.similarity}% (${result.pass ? 'PASS' : 'FAIL'})`);
    console.log(`[figma-pixel] tuned ${result.tuned ? 'yes' : 'no'}`);
    console.log(`[figma-pixel] preview ${result.previewPath}`);
    if (result.reportPaths?.markdown) console.log(`[figma-pixel] report ${result.reportPaths.markdown}`);
    process.exitCode = result.pass ? 0 : 2;
  } else if (command === 'serve') {
    const options = parseOptions(args);
    const previewDir = options.dir || 'generated/figma-preview';
    const port = String(options.port || 4173);
    await runNodeScript('serve-preview.mjs', [previewDir, port]);
  } else if (command === 'plugin-bridge') {
    const options = parseOptions(args);
    await runNodeScript('figma-plugin-bridge.mjs', [String(options.port || 4758)]);
  } else if (command === 'mcp') {
    await runNodeScript('figma-mcp-server.mjs', args);
  } else if (command === 'frontend-bridge') {
    const options = parseOptions(args);
    await runNodeScript('frontend-to-figma-bridge.mjs', [String(options.port || 4760)]);
  } else {
    console.error(`[figma-pixel] Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[figma-pixel] ${error.message}`);
  process.exitCode = 1;
}

function runNodeScript(scriptName, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, 'scripts', scriptName), ...scriptArgs], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${scriptName} stopped with signal ${signal}`));
      else {
        process.exitCode = code || 0;
        resolve();
      }
    });
  });
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--cwd') options.cwd = next();
    else if (arg === '--url' || arg === '--figma-url') options.url = next();
    else if (arg === '--file-key') options.fileKey = next();
    else if (arg === '--node-id') options.nodeId = next();
    else if (arg === '--token') options.token = next();
    else if (arg === '--threshold') options.threshold = Number(next());
    else if (arg === '--baseline') options.baseline = next();
    else if (arg === '--actual') options.actual = next();
    else if (arg === '--manifest') options.manifest = next();
    else if (arg === '--report-dir') options.reportDir = next();
    else if (arg === '--dir') options.dir = next();
    else if (arg === '--port') options.port = Number(next());
    else if (arg === '--interaction-profile') options.interactionProfile = next();
    else if (arg === '--auto-interactions') options.autoInteractions = true;
    else if (arg === '--no-auto-interactions') options.autoInteractions = false;
    else if (arg === '--no-assets') options.assets = false;
    else if (arg === '--no-preview') options.preview = false;
    else if (arg === '--no-cache') options.cache = false;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`figma-pixel - Figma pixel-lock to frontend bridge

Usage:
  figma-pixel sync --url <figma-url> [--node-id 0:1]
  figma-pixel sync --url <figma-url> --auto-interactions [--interaction-profile game|social|product]
  figma-pixel serve [--port 4173]
  figma-pixel plugin-bridge [--port 4758]
  figma-pixel verify [--threshold 95]
  figma-pixel auto-tune [--threshold 95]
  figma-pixel mcp

Environment:
  FIGMA_TOKEN       Figma personal access token
  FIGMA_URL         Figma design URL
  FIGMA_FILE_KEY    Figma file key, if not using FIGMA_URL
  FIGMA_NODE_ID     Root frame/node id

Outputs:
  public/figma-assets/             normalized manifest and exported assets
  generated/figma-preview/         runnable preview HTML
  reports/figma-visual-diff/       visual comparison report

Performance:
  Sync reuses local 4x PNG/SVG/image exports when the Figma file revision is unchanged.
  Use --no-cache to force fresh asset exports.
`);
}
