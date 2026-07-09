import path from 'path';
import fs from 'fs-extra';
import { discoverImages, formatBytes } from './utils.js';
import { generateAssets } from './generate.js';
import { compressImages } from './compress.js';
import { buildManifest, buildManifestEntry } from './manifest.js';
import { logger } from './logger.js';
import { runAudit } from './audit.js';
import { optimizeSvgFile } from './svg.js';
import type { CompressOptions } from './types.js';
import chalk from 'chalk';

// ─── Build Pipeline ───────────────────────────────────────────────────

export interface BuildOptions {
  input: string;
  output: string;
  quality?: number;
  concurrency?: number;
}

export interface BuildResult {
  filesProcessed: number;
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedPercent: number;
  manifestPath: string;
  svgsOptimized: number;
  duplicatesRemoved: number;
  assetsGenerated: number;
}

export async function runBuildPipeline(options: BuildOptions): Promise<BuildResult> {
  const { input, output, quality = 80, concurrency = 4 } = options;
  const resolvedInput = path.resolve(input);
  const resolvedOutput = path.resolve(output);

  await fs.ensureDir(resolvedOutput);

  logger.info(chalk.hex('#7C3AED').bold(`⚡ Pixora Build Pipeline starting…`));
  logger.info(`  Input:  ${resolvedInput}`);
  logger.info(`  Output: ${resolvedOutput}`);
  console.log('');

  // ── Step 1: Discover all images ─────────────────────────────────────
  logger.info('Step 1/7 — Discovering images…');
  const allImages = await discoverImages(resolvedInput, { recursive: true });
  logger.success(`  Found ${allImages.length} images`);

  // ── Step 2: Compress + convert to WebP + AVIF ────────────────────────
  logger.info('Step 2/7 — Compressing & converting to WebP + AVIF…');
  const compressOptions: CompressOptions = {
    input: resolvedInput,
    output: resolvedOutput,
    quality,
    concurrency,
    recursive: true,
    overwrite: false,
    report: false,
    watch: false,
    dryRun: false,
    clean: false,
    smartQuality: false,
    preserveMetadata: false,
    ignore: [],
    formats: ['webp', 'avif'],
  };
  const compressResult = await compressImages(compressOptions);
  const savedBytes = compressResult?.summary?.savedBytes ?? 0;
  const inputBytes = compressResult?.summary?.inputBytes ?? 0;
  const outputBytes = compressResult?.summary?.outputBytes ?? 0;
  const savedPercent = inputBytes > 0 ? (savedBytes / inputBytes) * 100 : 0;
  logger.success(`  Compressed ${compressResult?.summary?.filesProcessed ?? 0} files — saved ${formatBytes(savedBytes)}`);

  // ── Step 3: Generate responsive images + BlurHash + LQIP ─────────────
  logger.info('Step 3/7 — Generating responsive images, BlurHash, LQIP…');
  let assetsGenerated = 0;
  const manifestEntries = [];

  const genSubset = allImages.filter((f) => {
    const ext = path.extname(f).slice(1).toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext);
  });

  for (const imgPath of genSubset) {
    try {
      const result = await generateAssets(imgPath, resolvedOutput);
      const entry = await buildManifestEntry(imgPath, resolvedOutput, {
        blurhash: result.blurhash,
        lqip: result.lqip,
        dominant: result.dominantColor.primary,
        sizes: result.responsiveImages.map((r) => r.width),
        srcset: result.responsiveImages
          .map((r) => `${path.basename(r.path)} ${r.width}w`)
          .join(', '),
      });
      manifestEntries.push(entry);
      assetsGenerated++;
    } catch {}
  }
  logger.success(`  Generated assets for ${assetsGenerated} images`);

  // ── Step 4: Optimize SVGs ─────────────────────────────────────────────
  logger.info('Step 4/7 — Optimizing SVG files…');
  const { glob } = await import('fast-glob');
  const svgFiles = await glob('**/*.svg', { cwd: resolvedInput, absolute: true });
  let svgsOptimized = 0;
  for (const svgFile of svgFiles) {
    try {
      const outSvg = path.join(resolvedOutput, path.relative(resolvedInput, svgFile));
      await fs.ensureDir(path.dirname(outSvg));
      await optimizeSvgFile(svgFile, outSvg);
      svgsOptimized++;
    } catch {}
  }
  logger.success(`  Optimized ${svgsOptimized} SVG files`);

  // ── Step 5: Remove duplicates ─────────────────────────────────────────
  logger.info('Step 5/7 — Detecting and reporting duplicates…');
  let duplicatesRemoved = 0;
  try {
    const auditResult = await runAudit(resolvedOutput);
    duplicatesRemoved = auditResult.exactDuplicates.reduce((s, g) => s + g.length - 1, 0);
    if (duplicatesRemoved > 0) {
      logger.warn(`  Found ${duplicatesRemoved} duplicate files — review audit report`);
    } else {
      logger.success('  No exact duplicates found');
    }
  } catch {}

  // ── Step 6: Generate manifest.json ────────────────────────────────────
  logger.info('Step 6/7 — Generating manifest.json…');
  const manifestPath = await buildManifest(resolvedOutput, manifestEntries);
  logger.success(`  Manifest → ${manifestPath}`);

  // ── Step 7: Summary ───────────────────────────────────────────────────
  logger.info('Step 7/7 — Build complete!');

  return {
    filesProcessed: allImages.length,
    inputBytes,
    outputBytes,
    savedBytes,
    savedPercent,
    manifestPath,
    svgsOptimized,
    duplicatesRemoved,
    assetsGenerated,
  };
}

// ─── Printer ──────────────────────────────────────────────────────────

export function printBuildResult(result: BuildResult): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;

  console.log('\n' + accent.bold('🚀 Build Pipeline Complete'));
  console.log(dim('────────────────────────────────────────────────────────'));
  console.log(`  Images Processed:   ${result.filesProcessed}`);
  console.log(`  Assets Generated:   ${result.assetsGenerated}`);
  console.log(`  SVGs Optimized:     ${result.svgsOptimized}`);
  console.log(`  Duplicates Found:   ${result.duplicatesRemoved}`);
  console.log(`  Input Size:         ${formatBytes(result.inputBytes)}`);
  console.log(`  Output Size:        ${formatBytes(result.outputBytes)}`);
  console.log(`  Saved:              ${chalk.green(formatBytes(result.savedBytes))} (${result.savedPercent.toFixed(1)}%)`);
  console.log(`  Manifest:           ${result.manifestPath}`);
  console.log('');
}
