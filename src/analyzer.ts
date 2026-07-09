import sharp from 'sharp';
import path from 'path';
import chalk from 'chalk';

// ─── Analysis Result ─────────────────────────────────────────────────

export interface AnalysisResult {
  file: string;
  imageType: 'landscape' | 'portrait' | 'square' | 'icon';
  bestFormat: 'avif' | 'webp' | 'jpg' | 'png';
  recommendedQuality: number;
  estimatedSavingPercent: number;
  hasTransparency: boolean;
  detectedFaces: number;
  hasText: boolean;
  suggestedWidth: number;
  dominantColor: string;
  isAnimated: boolean;
  currentFormat: string;
  currentSize: number;
  notes: string[];
}

// ─── Heuristic helpers ────────────────────────────────────────────────

function detectImageType(
  width: number,
  height: number
): AnalysisResult['imageType'] {
  const ratio = width / height;
  if (width <= 128 && height <= 128) return 'icon';
  if (ratio > 1.2) return 'landscape';
  if (ratio < 0.8) return 'portrait';
  return 'square';
}

// Simple edge variance — high variance = likely text/graphics, low = photo
function detectTextLikelihood(stats: any): boolean {
  const channels = stats.channels;
  const maxEntropy = Math.max(...channels.map((c: any) => c.stdev));
  // High stdev across channels + certain patterns = likely has text overlay
  return maxEntropy > 60;
}

// Estimate if image likely has human subjects using skin-tone pixel ratio
async function estimateFaceCount(
  inputBuffer: Buffer
): Promise<number> {
  try {
    // Sample a 32x32 thumbnail for skin-tone detection
    const { data } = await sharp(inputBuffer)
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let skinPixels = 0;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      // Heuristic: skin tone ranges
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15) {
        skinPixels++;
      }
    }

    const skinRatio = skinPixels / (32 * 32);
    // Estimate number of faces based on skin ratio
    if (skinRatio > 0.3) return Math.ceil(skinRatio * 4);
    if (skinRatio > 0.15) return 1;
    return 0;
  } catch {
    return 0;
  }
}

function pickBestFormat(
  hasAlpha: boolean,
  isAnimated: boolean,
  imageType: AnalysisResult['imageType'],
  stdev: number
): AnalysisResult['bestFormat'] {
  if (isAnimated) return 'webp';
  if (hasAlpha) return 'avif';
  if (imageType === 'icon') return 'png';
  // Low variance = flat graphic → better as webp/avif
  // High variance = complex photo → avif saves most
  if (stdev < 30) return 'webp';
  return 'avif';
}

function estimateQuality(
  format: AnalysisResult['bestFormat'],
  stdev: number
): number {
  // Lower stdev = simpler image → can go lower quality
  const base = format === 'avif' ? 60 : 72;
  const adjustment = Math.round((stdev / 128) * 20);
  return Math.min(90, Math.max(45, base + adjustment));
}

function estimateSaving(
  currentFormat: string,
  bestFormat: AnalysisResult['bestFormat']
): number {
  const savingsTable: Record<string, Record<string, number>> = {
    jpg: { avif: 68, webp: 55, jpg: 20, png: 0 },
    jpeg: { avif: 68, webp: 55, jpg: 20, png: 0 },
    png: { avif: 80, webp: 70, jpg: 50, png: 30 },
    webp: { avif: 20, webp: 10, jpg: 0, png: 0 },
    avif: { avif: 5, webp: 0, jpg: 0, png: 0 },
    tiff: { avif: 85, webp: 75, jpg: 60, png: 40 },
    gif: { webp: 70, avif: 60, jpg: 40, png: 0 },
  };
  const row = savingsTable[currentFormat.toLowerCase()];
  return row?.[bestFormat] ?? 30;
}

function suggestWidth(width: number, imageType: AnalysisResult['imageType']): number {
  if (imageType === 'icon') return Math.min(width, 128);
  if (width > 2560) return 1920;
  if (width > 1920) return 1440;
  if (width > 1440) return 1280;
  return width;
}

// ─── Main Analyzer ────────────────────────────────────────────────────

export async function analyzeImage(filePath: string): Promise<AnalysisResult> {
  const buffer = await import('fs-extra').then((fs) => fs.readFile(filePath));
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const stats = await image.stats();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const hasAlpha = metadata.hasAlpha ?? false;
  const isAnimated = (metadata.pages ?? 1) > 1;
  const currentFormat = (metadata.format ?? path.extname(filePath).slice(1)).toLowerCase();

  const imageType = detectImageType(width, height);
  const avgStdev = stats.channels.reduce((s: number, c: any) => s + c.stdev, 0) / (stats.channels.length || 1);
  const bestFormat = pickBestFormat(hasAlpha, isAnimated, imageType, avgStdev);
  const recommendedQuality = estimateQuality(bestFormat, avgStdev);
  const estimatedSavingPercent = estimateSaving(currentFormat, bestFormat);
  const hasText = detectTextLikelihood(stats);
  const detectedFaces = await estimateFaceCount(buffer);
  const suggestedWidth = suggestWidth(width, imageType);

  // Extract dominant color
  let dominantColor = '#FFFFFF';
  try {
    const { data } = await sharp(buffer)
      .resize(4, 4, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const r = data[0]!;
    const g = data[1]!;
    const b = data[2]!;
    dominantColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  } catch {}

  // Build notes
  const notes: string[] = [];
  if (currentFormat === 'png' && !hasAlpha) {
    notes.push('PNG without transparency — consider converting to AVIF/WebP for much smaller files');
  }
  if (width > 2560) {
    notes.push(`Width ${width}px is very large — consider resizing to ${suggestedWidth}px`);
  }
  if (isAnimated) {
    notes.push('Animated image detected — WebP animation is recommended over GIF');
  }
  if (hasText) {
    notes.push('Text/overlay detected — use lossless or high quality to preserve sharpness');
  }
  if (detectedFaces > 0) {
    notes.push(`~${detectedFaces} face(s) detected — consider smart cropping for thumbnails`);
  }

  const stat = await import('fs-extra').then((fs) => fs.stat(filePath));

  return {
    file: filePath,
    imageType,
    bestFormat,
    recommendedQuality,
    estimatedSavingPercent,
    hasTransparency: hasAlpha,
    detectedFaces,
    hasText,
    suggestedWidth,
    dominantColor,
    isAnimated,
    currentFormat,
    currentSize: stat.size,
    notes,
  };
}

// ─── CLI Printer ──────────────────────────────────────────────────────

export function printAnalysis(result: AnalysisResult): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;

  console.log('\n' + accent.bold(`🧠 AI Image Analysis: ${path.basename(result.file)}`));
  console.log(dim('────────────────────────────────────────────────────────'));

  const row = (label: string, value: string) =>
    console.log(`  ${chalk.cyan(label.padEnd(24))} ${chalk.white(value)}`);

  row('Image Type', result.imageType.charAt(0).toUpperCase() + result.imageType.slice(1));
  row('Current Format', result.currentFormat.toUpperCase());
  row('Best Format', chalk.green(result.bestFormat.toUpperCase()));
  row('Recommended Quality', `${result.recommendedQuality}/100`);
  row('Estimated Saving', chalk.green(`~${result.estimatedSavingPercent}%`));
  row('Transparency', result.hasTransparency ? 'Yes' : 'No');
  row('Animated', result.isAnimated ? 'Yes' : 'No');
  row('Detected Faces', String(result.detectedFaces));
  row('Text Detected', result.hasText ? 'Likely' : 'No');
  row('Suggested Width', `${result.suggestedWidth}px`);
  row('Dominant Color', result.dominantColor);

  if (result.notes.length > 0) {
    console.log(`\n  ${chalk.yellow('💡 Suggestions:')}`);
    result.notes.forEach((n) => console.log(`    • ${n}`));
  }

  console.log('');
}
