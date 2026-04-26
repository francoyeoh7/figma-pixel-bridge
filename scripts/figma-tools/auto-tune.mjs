export function hasExactExport(manifest) {
  return Boolean(manifest?.exactExports?.svg?.publicPath || manifest?.exactExports?.png?.publicPath);
}

export function shouldUsePixelLockFallback(comparison, manifest) {
  return Boolean(comparison && comparison.similarity < comparison.threshold && hasExactExport(manifest));
}

export function applyPixelLockFallback(manifest, { reason = 'similarity below threshold', similarity, threshold } = {}) {
  return {
    ...manifest,
    previewMode: 'pixel-lock-first',
    tuning: {
      ...(manifest.tuning ?? {}),
      updatedAt: new Date().toISOString(),
      applied: [
        ...((manifest.tuning?.applied) ?? []),
        {
          strategy: 'pixel-lock-fallback',
          reason,
          similarityBefore: similarity,
          threshold,
        },
      ],
    },
  };
}
