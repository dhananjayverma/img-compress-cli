/**
 * img-compress-cli — Programmatic API
 *
 * Use this to integrate image compression into build pipelines,
 * scripts, or other Node.js programs.
 *
 * @example
 * ```ts
 * import { compress } from 'img-compress-cli';
 *
 * const result = await compress('./images', {
 *   quality: 75,
 *   formats: ['webp', 'avif'],
 *   recursive: true,
 *   report: true,
 * });
 *
 * console.log(`Processed ${result.summary.filesProcessed} files`);
 * console.log(`Saved ${result.summary.savedPercent.toFixed(1)}%`);
 * ```
 */

import { compressImages } from './compress.js';
import { buildRuntimeOptions } from './utils.js';
import type { CompressOptions, ProcessResult, ReportSummary } from './types.js';

// ─── Public API types ────────────────────────────────────────────────

export type { CompressOptions, ProcessResult, ReportSummary };

export interface CompressApiOptions {
  /** Target quality 1-100 */
  quality?: number;
  /** Resize width in pixels */
  width?: number;
  /** Target output size, e.g. '300kb' or '2mb' */
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
  /** Keep EXIF/IPTC/XMP metadata */
  preserveMetadata?: boolean;
  /** Parallel workers (default: CPU count) */
  concurrency?: number;
  /** Glob patterns to ignore */
  ignore?: string[];
}

export interface CompressResult {
  results: ProcessResult[];
  summary: ReportSummary;
}

// ─── Main API function ───────────────────────────────────────────────

/**
 * Compress images in the given path.
 *
 * @param input - Path to a folder or single image file
 * @param options - Compression options
 * @returns Processing results and summary statistics
 */
export async function compress(
  input: string,
  options: CompressApiOptions = {},
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
    preserveMetadata: options.preserveMetadata,
    concurrency: options.concurrency,
    ignore: options.ignore,
  };

  const runtimeOptions = buildRuntimeOptions(input, cliOptions);
  return compressImages(runtimeOptions);
}

// Re-export internals for advanced usage
export { compressImages } from './compress.js';
export { createResizePipeline } from './resize.js';
export { encodeSharp } from './convert.js';
