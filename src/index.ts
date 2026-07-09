/**
 * pixora — Programmatic API
 *
 * @example
 * ```ts
 * import { compress, generateAssets, runAudit, runBenchmark } from '@dhananjay_verma9546/pixora-compress';
 *
 * // Compress a folder
 * const result = await compress('./images', {
 *   quality: 75,
 *   formats: ['webp', 'avif'],
 *   recursive: true,
 * });
 * console.log(`Saved ${result.summary.savedPercent.toFixed(1)}%`);
 *
 * // Generate performance assets
 * const assets = await generateAssets('./hero.jpg', './output');
 * console.log(assets.blurhash);
 *
 * // Audit a folder for duplicates & missing formats
 * const audit = await runAudit('./images');
 * console.log(audit.missingWebP.length, 'images missing WebP');
 * ```
 */

import { compressImages } from './compress.js';
import { buildRuntimeOptions } from './utils.js';
import type { CompressOptions, ProcessResult, ReportSummary, PixoraPlugin } from './types.js';

// ─── Public type re-exports ──────────────────────────────────────────
export type { CompressOptions, ProcessResult, ReportSummary };

export interface CompressApiOptions {
  /** Target quality 1-100 */
  quality?: number;
  /** Resize width in pixels */
  width?: number;
  /** Target output size e.g. '300kb' or '2mb' */
  maxSize?: string;
  /** Output directory */
  output?: string;
  /** Output formats: ['webp', 'avif', 'jpg', 'png'] */
  formats?: string[];
  /** Scan subfolders */
  recursive?: boolean;
  /** Replace originals in place */
  overwrite?: boolean;
  /** Print size report */
  report?: boolean;
  /** Preview without writing */
  dryRun?: boolean;
  /** Remove output dir first */
  clean?: boolean;
  /** Auto-detect quality per image */
  smartQuality?: boolean;
  /** Auto-choose best format based on image content */
  bestFormat?: boolean;
  /** Keep EXIF/IPTC/XMP metadata */
  preserveMetadata?: boolean;
  /** Parallel workers (default: CPU count) */
  concurrency?: number;
  /** Glob patterns to ignore */
  ignore?: string[];
  /** Compression profile: web | ecommerce | print | social | blog | thumbnail */
  profile?: string;
  plugins?: PixoraPlugin[];
}

export interface CompressResult {
  results: ProcessResult[];
  summary: ReportSummary;
}

// ─── compress() ──────────────────────────────────────────────────────
/**
 * Compress images in the given path.
 *
 * @param input - Path to a folder or single image file
 * @param options - Compression options
 */
export async function compress(
  input: string,
  options: CompressApiOptions = {}
): Promise<CompressResult> {
  const cliOptions: Record<string, unknown> = {
    quality: options.quality,
    width: options.width,
    maxSize: options.maxSize,
    output: options.output,
    formats: options.formats,
    recursive: options.recursive,
    overwrite: options.overwrite,
    report: options.report ?? false,
    dryRun: options.dryRun,
    clean: options.clean,
    smartQuality: options.smartQuality,
    bestFormat: options.bestFormat,
    preserveMetadata: options.preserveMetadata,
    concurrency: options.concurrency,
    ignore: options.ignore,
    profile: options.profile,
    plugins: options.plugins,
  };

  const runtimeOptions = buildRuntimeOptions(input, cliOptions);
  return compressImages(runtimeOptions);
}

// ─── Other API exports ───────────────────────────────────────────────
export { compressImages } from './compress.js';
export { createResizePipeline } from './resize.js';
export { encodeSharp } from './convert.js';
export { generateAssets } from './generate.js';
export type { GenerationResult } from './generate.js';
export { generateSpriteSheet } from './sprite.js';
export type { SpriteResult } from './sprite.js';
export { optimizeSvgFile } from './svg.js';
export { runAudit, getImageStats, printAuditReport } from './audit.js';
export type { AuditResult, ImageStats } from './audit.js';
export { compareImagesQuality } from './metrics.js';
export type { QualityComparison } from './metrics.js';
export { runBenchmark } from './benchmark.js';
export { updateHtmlFile, updateMarkdownFile } from './integrations.js';
export { generateReports } from './reports.js';
export type { ReportOptions } from './reports.js';
export { getCache, saveCache } from './cache.js';
export { backupFile, restoreBackups } from './backup.js';
export { COMPRESSION_PROFILES, applyProfile } from './profiles.js';
export type { CompressionProfile } from './profiles.js';
export { pixoraPlugin } from './plugins/vite.js';
export type { VitePluginPixoraOptions } from './plugins/vite.js';
export { withPixora } from './plugins/next.js';
export type { NextPluginPixoraOptions } from './plugins/next.js';
export type { PixoraPlugin } from './types.js';
