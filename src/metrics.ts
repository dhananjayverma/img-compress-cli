import ssimLib from 'ssim.js';
import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

// Support both ES module and CJS imports of ssim.js
const ssim = (ssimLib as any).default || ssimLib;

export interface QualityComparison {
  ssim: number;
  psnr: number;
  mse: number;
  compressionRatio: number;
}

export async function compareImagesQuality(
  originalPath: string,
  compressedPath: string
): Promise<QualityComparison> {
  const origStats = await fs.stat(originalPath);
  const compStats = await fs.stat(compressedPath);
  const compressionRatio = origStats.size / (compStats.size || 1);

  // Load and resize to same dimensions for pixel comparison
  const origMetadata = await sharp(originalPath).metadata();
  const width = origMetadata.width ?? 512;
  const height = origMetadata.height ?? 512;

  const origBuffer = await sharp(originalPath)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  const compBuffer = await sharp(compressedPath)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  // ─── MSE / PSNR Calculation ───────────────────────────────────────
  let sumSquaredError = 0;
  for (let i = 0; i < origBuffer.length; i++) {
    const diff = origBuffer[i]! - compBuffer[i]!;
    sumSquaredError += diff * diff;
  }
  const mse = sumSquaredError / origBuffer.length;
  let psnr = 99.0; // Perfect score/no diff
  if (mse > 0) {
    psnr = 20 * Math.log10(255) - 10 * Math.log10(mse);
  }

  // ─── SSIM Calculation ──────────────────────────────────────────────
  let ssimScore = 1.0;
  try {
    const result = ssim(
      { data: origBuffer, width, height },
      { data: compBuffer, width, height }
    );
    ssimScore = result.mssim;
  } catch (err) {
    // fallback if ssim throws
    ssimScore = 1 - (mse / (255 * 255));
  }

  return {
    ssim: Math.max(0, Math.min(1, ssimScore)),
    psnr: Math.max(0, psnr),
    mse,
    compressionRatio,
  };
}

// ─── Visual Diff Heatmap ──────────────────────────────────────────────

export interface HeatmapResult {
  outputPath: string;
  maxDiff: number;
  avgDiff: number;
  diffPixelPercent: number;
}

/**
 * Generate a difference heatmap image between two images.
 * Red = high difference, blue = low/no difference.
 */
export async function generateDiffHeatmap(
  originalPath: string,
  compressedPath: string,
  outputPath?: string
): Promise<HeatmapResult> {
  const origMeta = await sharp(originalPath).metadata();
  const width = origMeta.width ?? 512;
  const height = origMeta.height ?? 512;

  // Load both as raw RGB (no alpha)
  const origRaw = await sharp(originalPath)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const compRaw = await sharp(compressedPath)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const heatmapData = Buffer.alloc(width * height * 3);
  let maxDiff = 0;
  let totalDiff = 0;
  let diffPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const rDiff = Math.abs((origRaw[i * 3]!)     - (compRaw[i * 3]!));
    const gDiff = Math.abs((origRaw[i * 3 + 1]!) - (compRaw[i * 3 + 1]!));
    const bDiff = Math.abs((origRaw[i * 3 + 2]!) - (compRaw[i * 3 + 2]!));
    const diff = Math.round((rDiff + gDiff + bDiff) / 3);

    totalDiff += diff;
    if (diff > 5) diffPixels++;
    if (diff > maxDiff) maxDiff = diff;

    // Map diff 0–255 to a heat color: blue (low) → green → red (high)
    const t = diff / 255;
    if (t < 0.5) {
      // blue → green
      heatmapData[i * 3]     = 0;
      heatmapData[i * 3 + 1] = Math.round(t * 2 * 255);
      heatmapData[i * 3 + 2] = Math.round((1 - t * 2) * 255);
    } else {
      // green → red
      heatmapData[i * 3]     = Math.round((t - 0.5) * 2 * 255);
      heatmapData[i * 3 + 1] = Math.round((1 - (t - 0.5) * 2) * 255);
      heatmapData[i * 3 + 2] = 0;
    }
  }

  const avgDiff = totalDiff / (width * height);
  const diffPixelPercent = (diffPixels / (width * height)) * 100;

  // Default output path: alongside original with -diff suffix
  const outPath =
    outputPath ??
    path.join(
      path.dirname(originalPath),
      `${path.basename(originalPath, path.extname(originalPath))}-diff-heatmap.png`
    );

  await sharp(heatmapData, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(outPath);

  return { outputPath: outPath, maxDiff, avgDiff, diffPixelPercent };
}
