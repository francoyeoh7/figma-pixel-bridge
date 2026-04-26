import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function imageFromPixels(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel, index) => data.set(pixel, index * 4));
  return { width, height, data };
}

export function createSolidImage(width, height, rgba) {
  return imageFromPixels(width, height, Array.from({ length: width * height }, () => rgba));
}

export function compareImages(baseline, actual, options = {}) {
  const width = Math.min(baseline.width, actual.width);
  const height = Math.min(baseline.height, actual.height);
  const totalPixels = width * height;
  const threshold = options.threshold ?? 95;
  let totalDelta = 0;
  let changedPixels = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bi = (y * baseline.width + x) * 4;
      const ai = (y * actual.width + x) * 4;
      const delta = pixelDelta(baseline.data, bi, actual.data, ai);
      totalDelta += delta;
      if (delta > (options.pixelChangeThreshold ?? 0.02)) {
        changedPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const avgDelta = totalPixels ? totalDelta / totalPixels : 1;
  const dimensionPenalty = baseline.width === actual.width && baseline.height === actual.height ? 0 : 0.08;
  const similarity = clamp(0, 100, (1 - Math.min(1, avgDelta + dimensionPenalty)) * 100);
  const boundingBox = changedPixels ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;

  return {
    similarity: round(similarity),
    threshold,
    pass: similarity >= threshold,
    width,
    height,
    baselineSize: { width: baseline.width, height: baseline.height },
    actualSize: { width: actual.width, height: actual.height },
    totalPixels,
    changedPixels,
    changedRatio: totalPixels ? round(changedPixels / totalPixels) : 0,
    averageDelta: round(avgDelta),
    boundingBox,
    recommendations: recommendationsFor({ similarity, threshold, changedPixels, totalPixels, boundingBox, baseline, actual }),
  };
}

export function diffImages(baseline, actual) {
  const width = Math.min(baseline.width, actual.width);
  const height = Math.min(baseline.height, actual.height);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bi = (y * baseline.width + x) * 4;
      const ai = (y * actual.width + x) * 4;
      const di = (y * width + x) * 4;
      const delta = pixelDelta(baseline.data, bi, actual.data, ai);
      if (delta > 0.02) {
        data.set([255, Math.round(64 * (1 - delta)), 64, 255], di);
      } else {
        const gray = Math.round((baseline.data[bi] + baseline.data[bi + 1] + baseline.data[bi + 2]) / 3 * 0.35);
        data.set([gray, gray, gray, 255], di);
      }
    }
  }
  return { width, height, data };
}

export async function readPpm(filePath) {
  const buffer = await readFile(filePath);
  const header = parsePpmHeader(buffer);
  const pixelStart = header.offset;
  const pixelBytes = buffer.slice(pixelStart);
  const data = new Uint8ClampedArray(header.width * header.height * 4);
  for (let index = 0, out = 0; index < pixelBytes.length && out < data.length; index += 3, out += 4) {
    data[out] = pixelBytes[index];
    data[out + 1] = pixelBytes[index + 1];
    data[out + 2] = pixelBytes[index + 2];
    data[out + 3] = 255;
  }
  return { width: header.width, height: header.height, data };
}

export async function readImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ppm' || ext === '.pnm') return readPpm(filePath);
  if (ext === '.bmp') return readBmp(filePath);
  const converted = `${filePath}.visual-diff.bmp`;
  try {
    await execFileAsync('sips', ['-s', 'format', 'bmp', filePath, '--out', converted], { timeout: 60_000 });
    return await readBmp(converted);
  } catch (error) {
    throw new Error(`Could not read image ${filePath}. Install/use macOS sips-compatible PNG/SVG/JPEG/BMP, or provide a .ppm file. ${error.message}`);
  }
}

export async function readBmp(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.slice(0, 2).toString('ascii') !== 'BM') throw new Error('Only BMP files are supported');
  const pixelOffset = buffer.readUInt32LE(10);
  const dibSize = buffer.readUInt32LE(14);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const planes = buffer.readUInt16LE(26);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (planes !== 1) throw new Error('Invalid BMP plane count');
  if (![24, 32].includes(bitsPerPixel)) throw new Error(`Unsupported BMP bit depth: ${bitsPerPixel}`);
  if (![0, 3].includes(compression)) throw new Error(`Unsupported BMP compression: ${compression}`);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = topDown ? y : height - y - 1;
    const rowOffset = pixelOffset + sourceY * rowStride;
    for (let x = 0; x < width; x += 1) {
      const source = rowOffset + x * (bitsPerPixel / 8);
      const target = (y * width + x) * 4;
      data[target] = buffer[source + 2];
      data[target + 1] = buffer[source + 1];
      data[target + 2] = buffer[source];
      data[target + 3] = bitsPerPixel === 32 ? buffer[source + 3] : 255;
    }
  }
  return { width, height, data, dibSize };
}

export async function writePpm(filePath, image) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const header = Buffer.from(`P6\n${image.width} ${image.height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(image.width * image.height * 3);
  for (let inIndex = 0, outIndex = 0; inIndex < image.data.length; inIndex += 4, outIndex += 3) {
    pixels[outIndex] = image.data[inIndex];
    pixels[outIndex + 1] = image.data[inIndex + 1];
    pixels[outIndex + 2] = image.data[inIndex + 2];
  }
  await writeFile(filePath, Buffer.concat([header, pixels]));
}

export async function writeVisualReport({ reportDir, baseline, actual, comparison, diff }) {
  await mkdir(reportDir, { recursive: true });
  const paths = {
    baseline: path.join(reportDir, 'baseline.ppm'),
    actual: path.join(reportDir, 'actual.ppm'),
    diff: path.join(reportDir, 'diff.ppm'),
    json: path.join(reportDir, 'report.json'),
    markdown: path.join(reportDir, 'report.md'),
  };
  await writePpm(paths.baseline, baseline);
  await writePpm(paths.actual, actual);
  await writePpm(paths.diff, diff);
  await writeFile(paths.json, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  await writeFile(paths.markdown, renderVisualReportMarkdown(comparison), 'utf8');
  return paths;
}

export function renderVisualReportMarkdown(report) {
  const status = report.similarity >= report.threshold ? '达标' : '未达标';
  const bbox = report.boundingBox
    ? `x=${report.boundingBox.x}, y=${report.boundingBox.y}, w=${report.boundingBox.width}, h=${report.boundingBox.height}`
    : '无明显差异区域';
  const recommendations = report.recommendations?.length
    ? report.recommendations.map((item) => `- ${item}`).join('\n')
    : '- 暂无自动建议。';
  return `# Figma Visual Diff Report\n\n` +
    `**Status:** ${status}\n\n` +
    `**Similarity:** ${Number(report.similarity).toFixed(2)}%\n\n` +
    `**Threshold:** ${Number(report.threshold).toFixed(2)}%\n\n` +
    `**Changed Pixels:** ${report.changedPixels} / ${report.totalPixels}\n\n` +
    `**Diff Bounds:** ${bbox}\n\n` +
    `## Recommendations\n\n${recommendations}\n`;
}

function parsePpmHeader(buffer) {
  let offset = 0;
  const tokens = [];
  while (tokens.length < 4 && offset < buffer.length) {
    while (buffer[offset] === 0x20 || buffer[offset] === 0x0a || buffer[offset] === 0x0d || buffer[offset] === 0x09) offset += 1;
    if (buffer[offset] === 0x23) {
      while (offset < buffer.length && buffer[offset] !== 0x0a) offset += 1;
      continue;
    }
    const start = offset;
    while (offset < buffer.length && ![0x20, 0x0a, 0x0d, 0x09].includes(buffer[offset])) offset += 1;
    tokens.push(buffer.slice(start, offset).toString('ascii'));
  }
  while (buffer[offset] === 0x20 || buffer[offset] === 0x0a || buffer[offset] === 0x0d || buffer[offset] === 0x09) offset += 1;
  if (tokens[0] !== 'P6') throw new Error('Only binary PPM P6 files are supported');
  if (tokens[3] !== '255') throw new Error('Only max value 255 PPM files are supported');
  return { width: Number(tokens[1]), height: Number(tokens[2]), offset };
}

function pixelDelta(a, ai, b, bi) {
  const dr = Math.abs(a[ai] - b[bi]) / 255;
  const dg = Math.abs(a[ai + 1] - b[bi + 1]) / 255;
  const db = Math.abs(a[ai + 2] - b[bi + 2]) / 255;
  const da = Math.abs((a[ai + 3] ?? 255) - (b[bi + 3] ?? 255)) / 255;
  return Math.sqrt((dr ** 2 * 0.299) + (dg ** 2 * 0.587) + (db ** 2 * 0.114) + (da ** 2 * 0.1));
}

function recommendationsFor({ similarity, threshold, changedPixels, totalPixels, boundingBox, baseline, actual }) {
  const recommendations = [];
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    recommendations.push('Match the preview viewport and exported Figma frame dimensions before comparing.');
  }
  if (similarity < threshold) {
    recommendations.push('Enable pixel-lock fallback for complex layers or mixed-mode effects that browser CSS cannot reproduce exactly.');
  }
  if (changedPixels / Math.max(1, totalPixels) > 0.1 && boundingBox) {
    recommendations.push(`Largest visible difference is bounded around ${boundingBox.x},${boundingBox.y} ${boundingBox.width}x${boundingBox.height}. Inspect this region first.`);
  }
  return recommendations;
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}
