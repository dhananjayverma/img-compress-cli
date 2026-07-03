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

// ─── Smart quality detection ─────────────────────────────────────────

async function detectSmartQuality(inputFile: string, format: string): Promise<number> {
  try {
    const metadata = await sharp(inputFile).metadata();
    const pixels = (metadata.width ?? 1000) * (metadata.height ?? 1000);
    const channels = metadata.channels ?? 3;
    const hasAlpha = metadata.hasAlpha ?? false;

    // High-res photos get higher quality, small/simple images get lower
    const isLargePhoto = pixels > 2_000_000 && channels >= 3;
    const isSmallIcon = pixels < 100_000;

    if (format === 'avif') {
      return isLargePhoto ? 60 : isSmallIcon ? 45 : 50;
    }
    if (format === 'webp') {
      return isLargePhoto ? 82 : isSmallIcon ? 70 : 76;
    }
    if (format === 'png' && hasAlpha) {
      return 80; // PNG quality affects palette generation
    }

    // JPEG
    return isLargePhoto ? 85 : isSmallIcon ? 72 : 80;
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
  const formats = resolveTargetFormats(inputFile, options);
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

    if (options.dryRun) {
      // Estimate output size without writing
      const buffer = await encodeBestEffort(inputFile, format, options);
      results.push({
        source: inputFile,
        output: outputPath,
        format,
        inputBytes: inputStats.size,
        outputBytes: buffer.length,
      });
      continue;
    }

    const buffer = await encodeBestEffort(inputFile, format, options);
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

  if (options.dryRun) {
    logger.warn('Dry run — no files will be written');
  }

  const spinner = ora({
    text: `Preparing ${validFiles.length} image${validFiles.length === 1 ? '' : 's'}…`,
    color: 'magenta',
    prefixText: '  ',
  }).start();

  const progress = makeWriter(validFiles.length);
  progress.start();

  let completed = 0;
  const results = await runWithConcurrency(
    validFiles,
    options.concurrency || Math.max(1, Math.min(os.cpus().length, 8)),
    async (file) => {
      const output = await processOne(file, options, inputRoot, outputRoot);
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

  const summary = buildStatsSummary(results);

  if (options.report) {
    printDetailedReport(results, summary);
  } else {
    printCompactSummary(summary);
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
  if (options.watch) {
    return watchLoop(options);
  }
  return compressOnce(options);
}
