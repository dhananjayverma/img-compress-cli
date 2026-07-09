import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import fsExtra from 'fs-extra';
import sharp from 'sharp';
import chalk from 'chalk';
import ora from 'ora';
import cliProgress from 'cli-progress';
import { createResizePipeline } from './resize.js';
import { encodeSharp } from './convert.js';
import { printDetailedReport, printCompactSummary } from './report.js';
import { logger } from './logger.js';
import {
  buildOutputPath,
  buildStatsSummary,
  discoverImages,
  formatBytes,
  getOutputRoot,
  isAnimatedGif,
  isSupportedImage,
  resolveTargetFormats,
} from './utils.js';
import type { CompressOptions, ProcessResult, ReportSummary } from './types.js';
import { ENCODABLE_FORMATS } from './types.js';
import { applyProfile } from './profiles.js';
import { backupFile } from './backup.js';
import { getCache, saveCache, getFileHash } from './cache.js';

// ─── Progress bar wrapper ────────────────────────────────────────────

interface ProgressWriter {
  start(): void;
  update(value: number): void;
  stop(): void;
}

function makeWriter(total: number): ProgressWriter {
  if (!process.stdout.isTTY || total < 2) {
    return { start() {}, update() {}, stop() {} };
  }

  const bar = new cliProgress.SingleBar(
    {
      format: `  ${chalk.hex('#7C3AED')('⚡')} |${chalk.hex('#7C3AED')('{bar}')}| {value}/{total} files`,
      hideCursor: true,
      clearOnComplete: true,
      noTTYOutput: true,
      barCompleteChar: '█',
      barIncompleteChar: '░',
    },
    cliProgress.Presets.shades_classic,
  );

  return {
    start() {
      bar.start(total, 0);
    },
    update(value: number) {
      bar.update(value);
    },
    stop() {
      bar.stop();
    },
  };
}

// ─── Image Analyzer ──────────────────────────────────────────────────

interface ImageAnalysisResult {
  category: 'photo' | 'screenshot' | 'logo' | 'illustration';
  bestFormat: string;
  width?: number;
  height?: number;
}

async function analyzeImage(inputFile: string): Promise<ImageAnalysisResult> {
  try {
    const img = sharp(inputFile);
    const metadata = await img.metadata();
    const stats = await img.stats();

    const hasAlpha = metadata.hasAlpha ?? false;
    const width = metadata.width ?? 1000;
    const height = metadata.height ?? 1000;
    const pixels = width * height;

    const channels = stats.channels;
    const rgbChannels = channels.slice(0, 3);
    const avgStdev = rgbChannels.reduce((sum, c) => sum + c.stdev, 0) / (rgbChannels.length || 1);

    let category: 'photo' | 'screenshot' | 'logo' | 'illustration' = 'photo';
    let bestFormat = 'webp';

    if (pixels < 100_000) {
      category = 'logo';
      bestFormat = hasAlpha ? 'webp' : 'png';
    } else if (avgStdev < 30) {
      category = 'screenshot';
      bestFormat = 'png';
    } else if (avgStdev < 45) {
      category = 'illustration';
      bestFormat = 'webp';
    } else {
      category = 'photo';
      bestFormat = 'avif'; // AVIF is superior for rich photo content
    }

    return { category, bestFormat, width, height };
  } catch {
    return { category: 'photo', bestFormat: 'webp' };
  }
}

// ─── Smart quality detection ─────────────────────────────────────────

async function detectSmartQuality(inputFile: string, format: string): Promise<number> {
  try {
    const { category } = await analyzeImage(inputFile);
    if (category === 'logo') {
      return format === 'avif' ? 45 : format === 'webp' ? 70 : 75;
    }
    if (category === 'screenshot') {
      return format === 'avif' ? 50 : format === 'webp' ? 75 : 80;
    }
    if (category === 'illustration') {
      return format === 'avif' ? 55 : format === 'webp' ? 75 : 80;
    }
    // photo
    return format === 'avif' ? 62 : format === 'webp' ? 82 : 85;
  } catch {
    return 80; // fallback
  }
}

// ─── Quality resolution ─────────────────────────────────────────────

async function getTargetQuality(
  options: CompressOptions,
  format: string,
  inputFile: string,
): Promise<number | undefined> {
  if (options.quality) return options.quality;
  if (options.smartQuality) return detectSmartQuality(inputFile, format);
  if (format === 'avif') return 55;
  if (format === 'png') return undefined;
  return 82;
}

// ─── Encoding ────────────────────────────────────────────────────────

async function encodeBuffer(
  inputFile: string,
  format: string,
  options: CompressOptions,
): Promise<Buffer> {
  const quality = await getTargetQuality(options, format, inputFile);
  const image = createResizePipeline(inputFile, options);
  const encoder = encodeSharp(image, format, {
    quality,
    preserveMetadata: options.preserveMetadata,
  });
  return encoder.toBuffer();
}

async function encodeBestEffort(
  inputFile: string,
  format: string,
  options: CompressOptions,
): Promise<Buffer> {
  const targetSize = options.maxSize;
  const supportsQuality = ['jpg', 'jpeg', 'webp', 'avif'].includes(format);

  if (!targetSize || !supportsQuality) {
    return encodeBuffer(inputFile, format, options);
  }

  let low = 30;
  let high = options.quality ?? 92;
  let best: Buffer | null = null;
  let fallback: Buffer | null = null;

  while (low <= high) {
    const quality = Math.round((low + high) / 2);
    const image = createResizePipeline(inputFile, options);
    const buffer = await encodeSharp(image, format, {
      quality,
      preserveMetadata: options.preserveMetadata,
    }).toBuffer();

    if (!fallback || buffer.length < fallback.length) {
      fallback = buffer;
    }

    if (buffer.length <= targetSize) {
      best = buffer;
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  return best ?? fallback ?? (await encodeBuffer(inputFile, format, options));
}

// ─── File I/O ────────────────────────────────────────────────────────

async function writeOutputFile(targetPath: string, buffer: Buffer): Promise<void> {
  await fsExtra.ensureDir(path.dirname(targetPath));
  await fsExtra.writeFile(targetPath, buffer);
}

// ─── Single file processing ─────────────────────────────────────────

async function processOne(
  inputFile: string,
  options: CompressOptions,
  inputRoot: string,
  outputRoot: string | null,
): Promise<ProcessResult[]> {
  // Handle animated GIFs — copy as-is
  if (isAnimatedGif(inputFile)) {
    if (options.dryRun) {
      const inputStats = await fsExtra.stat(inputFile);
      return [
        {
          source: inputFile,
          output: inputFile,
          format: 'gif',
          inputBytes: inputStats.size,
          outputBytes: inputStats.size,
          skipped: true,
          skipReason: 'animated GIF (copied as-is)',
        },
      ];
    }

    // Copy GIF to output
    const outputPath = buildOutputPath({
      inputRoot,
      sourceFile: inputFile,
      outputRoot,
      targetFormat: 'gif',
      overwrite: options.overwrite,
    });
    const inputStats = await fsExtra.stat(inputFile);
    await fsExtra.ensureDir(path.dirname(outputPath));
    await fsExtra.copy(inputFile, outputPath);
    return [
      {
        source: inputFile,
        output: outputPath,
        format: 'gif',
        inputBytes: inputStats.size,
        outputBytes: inputStats.size,
        skipped: true,
        skipReason: 'animated GIF',
      },
    ];
  }

  const inputStats = await fsExtra.stat(inputFile);

  // Auto resize suggestions & best format detection
  const { bestFormat, width, height } = await analyzeImage(inputFile);
  if (width && width > 2500) {
    logger.warn(`Image ${path.basename(inputFile)} is extremely high-resolution (${width}x${height}px). Consider resizing with --width to save bandwidth.`);
  }

  let formats = resolveTargetFormats(inputFile, options);
  if (options.bestFormat) {
    formats = [bestFormat];
  }

  const supportedTargetFormats = formats.filter((f) =>
    (ENCODABLE_FORMATS as readonly string[]).includes(f),
  );

  if (supportedTargetFormats.length === 0) {
    return [];
  }

  if (options.overwrite && supportedTargetFormats.length > 1) {
    throw new Error(`--overwrite cannot be used with multiple output formats for ${inputFile}`);
  }

  const results: ProcessResult[] = [];

  for (const format of supportedTargetFormats) {
    const outputPath = buildOutputPath({
      inputRoot,
      sourceFile: inputFile,
      outputRoot,
      targetFormat: format,
      overwrite: options.overwrite,
    });

    let buffer = await encodeBestEffort(inputFile, format, options);
    if (options.plugins) {
      for (const plugin of options.plugins) {
        if (plugin.transform) {
          const transformed = await plugin.transform(inputFile, buffer, options);
          if (transformed) {
            buffer = transformed.buffer;
          }
        }
      }
    }

    if (options.dryRun) {
      // Estimate output size without writing
      results.push({
        source: inputFile,
        output: outputPath,
        format,
        inputBytes: inputStats.size,
        outputBytes: buffer.length,
      });
      continue;
    }

    await writeOutputFile(outputPath, buffer);

    const outputStats = await fsExtra.stat(outputPath);
    results.push({
      source: inputFile,
      output: outputPath,
      format,
      inputBytes: inputStats.size,
      outputBytes: outputStats.size,
    });
  }

  return results;
}

// ─── Parallel runner ─────────────────────────────────────────────────

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<R[]>,
): Promise<R[]> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    const results: R[] = [];
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      results.push(...(await handler(item)));
    }
    return results;
  });

  const settled = await Promise.all(workers);
  return settled.flat();
}

// ─── Main compress function ──────────────────────────────────────────

async function compressOnce(
  options: CompressOptions,
): Promise<{ results: ProcessResult[]; summary: ReportSummary }> {
  // Run beforeCompress hooks
  if (options.plugins) {
    for (const plugin of options.plugins) {
      if (plugin.beforeCompress) {
        await plugin.beforeCompress(options);
      }
    }
  }

  const source = path.resolve(options.input);
  const exists = await fsExtra.pathExists(source);
  if (!exists) {
    throw new Error(`Input path does not exist: ${options.input}`);
  }

  if (options.overwrite && options.output) {
    throw new Error('Use either --overwrite or --output, not both.');
  }

  const inputStats = await fsExtra.stat(source);
  const inputRoot = inputStats.isDirectory() ? source : path.dirname(source);
  const outputRoot = getOutputRoot(source, options.output, options.overwrite);

  // --clean: remove output directory before processing
  if (options.clean && outputRoot) {
    if (await fsExtra.pathExists(outputRoot)) {
      await fsExtra.remove(outputRoot);
      logger.dim(`Cleaned output directory: ${path.relative(process.cwd(), outputRoot)}`);
    }
  }

  const files = await discoverImages(source, {
    recursive: options.recursive || inputStats.isDirectory(),
    ignore: options.ignore,
  });

  const validFiles = files.filter(isSupportedImage);
  if (validFiles.length === 0) {
    return { results: [], summary: buildStatsSummary([]) };
  }

  const cache = await getCache();
  const nextCache = { ...cache };

  if (options.dryRun) {
    logger.warn('Dry run — no files will be written');
  }

  const spinner = logger.isSilent
    ? { start() { return this; }, stop() {}, succeed() {}, text: '' }
    : ora({
        text: `Preparing ${validFiles.length} image${validFiles.length === 1 ? '' : 's'}…`,
        color: 'magenta',
        prefixText: '  ',
      }).start();

  const progress = logger.isSilent
    ? { start() {}, update() {}, stop() {} }
    : makeWriter(validFiles.length);
  progress.start();

  let completed = 0;
  const results = await runWithConcurrency(
    validFiles,
    options.concurrency || Math.max(1, Math.min(os.cpus().length, 8)),
    async (file) => {
      const stats = await fsExtra.stat(file);
      const fileHash = await getFileHash(file);
      const cacheKey = `${file}:${stats.mtimeMs}`;

      if (cache[cacheKey] && cache[cacheKey].hash === fileHash) {
        completed += 1;
        progress.update(completed);
        spinner.text = `Processed ${completed}/${validFiles.length}`;
        return [
          {
            source: file,
            output: buildOutputPath({
              inputRoot,
              sourceFile: file,
              outputRoot,
              targetFormat: resolveTargetFormats(file, options)[0] || 'webp',
              overwrite: options.overwrite,
            }),
            format: resolveTargetFormats(file, options)[0] || 'webp',
            inputBytes: stats.size,
            outputBytes: stats.size,
            skipped: true,
            skipReason: 'cached (no changes)',
          },
        ];
      }

      if (options.overwrite) {
        await backupFile(file);
      }

      const output = await processOne(file, options, inputRoot, outputRoot);
      nextCache[cacheKey] = { hash: fileHash, mtime: stats.mtimeMs, size: stats.size };
      completed += 1;
      progress.update(completed);
      spinner.text = `Processed ${completed}/${validFiles.length}`;
      return output;
    },
  );

  progress.stop();
  spinner.succeed(
    `Processed ${validFiles.length} image${validFiles.length === 1 ? '' : 's'}.`,
  );

  // Per-file log
  if (!logger.isSilent) {
    for (const item of results) {
      if (item.skipped) {
        console.log(
          `  ${chalk.yellow('⏩')} ${chalk.dim(path.relative(process.cwd(), item.source))} ${chalk.dim(`(${item.skipReason})`)}`,
        );
        continue;
      }
      const saved = item.inputBytes - item.outputBytes;
      const savedText =
        saved >= 0
          ? chalk.green(`-${formatBytes(saved)}`)
          : chalk.red(`+${formatBytes(Math.abs(saved))}`);
      console.log(
        `  ${chalk.green('✔')} ${chalk.white(path.relative(process.cwd(), item.source))} → ${chalk.dim(path.relative(process.cwd(), item.output))} ${savedText}`,
      );
    }
  }

  const summary = buildStatsSummary(results);
  await saveCache(nextCache);

  if (!logger.isSilent) {
    if (options.report) {
      printDetailedReport(results, summary);
    } else {
      printCompactSummary(summary);
    }
  }

  if (options.plugins) {
    for (const plugin of options.plugins) {
      if (plugin.afterCompress) {
        await plugin.afterCompress(results, summary);
      }
    }
  }

  return { results, summary };
}

// ─── Watch mode ──────────────────────────────────────────────────────

async function watchLoop(options: CompressOptions): Promise<never> {
  const source = path.resolve(options.input);
  const inputStats = await fsExtra.stat(source);
  const watchTarget = inputStats.isDirectory() ? source : path.dirname(source);

  // Initial compress
  await compressOnce(options);

  logger.warn('Watching for changes. Press Ctrl+C to stop.');

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;

  const handleChange = () => {
    if (busy) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      busy = true;
      try {
        console.log('');
        logger.dim('Change detected, re-compressing…');
        await compressOnce(options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      } finally {
        busy = false;
      }
    }, 500);
  };

  // Use fs.watch with recursive option (Node 20+)
  try {
    const watcher = fs.watch(watchTarget, { recursive: true }, () => {
      handleChange();
    });

    const cleanup = () => {
      watcher.close();
      if (debounceTimer) clearTimeout(debounceTimer);
      process.exit(0);
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  } catch {
    // Fallback to polling if fs.watch recursive isn't supported
    logger.dim('Falling back to polling watch (2s interval)…');
    let lastFingerprint = '';

    const snapshot = async (): Promise<string> => {
      const files = await discoverImages(source, {
        recursive: options.recursive || inputStats.isDirectory(),
        ignore: options.ignore,
      });
      const parts = await Promise.all(
        files.map(async (file) => {
          const stat = await fsExtra.stat(file);
          return `${file}:${stat.mtimeMs}:${stat.size}`;
        }),
      );
      return parts.join('|');
    };

    lastFingerprint = await snapshot();

    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const fingerprint = await snapshot();
        if (fingerprint !== lastFingerprint) {
          lastFingerprint = fingerprint;
          console.log('');
          logger.dim('Change detected, re-compressing…');
          await compressOnce(options);
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      } finally {
        busy = false;
      }
    }, 2000);

    const cleanup = () => {
      clearInterval(timer);
      process.exit(0);
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  // Keep process alive
  return new Promise<never>(() => {});
}

// ─── Public API ──────────────────────────────────────────────────────

export async function compressImages(
  options: CompressOptions,
): Promise<{ results: ProcessResult[]; summary: ReportSummary }> {
  const profileOptions = applyProfile(options);
  if (profileOptions.watch) {
    return watchLoop(profileOptions);
  }
  return compressOnce(profileOptions);
}
