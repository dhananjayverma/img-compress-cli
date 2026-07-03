import { program } from 'commander';
import { cosmiconfig } from 'cosmiconfig';
import chalk from 'chalk';
import { compressImages } from './compress.js';
import { buildRuntimeOptions } from './utils.js';
import { logger } from './logger.js';
import type { ConfigFile } from './types.js';

// ─── Config file loader ─────────────────────────────────────────────

async function loadConfig(): Promise<ConfigFile> {
  const explorer = cosmiconfig('img-compress', {
    searchPlaces: [
      'img-compress.config.js',
      'img-compress.config.cjs',
      'img-compress.config.mjs',
      'img-compress.config.json',
      '.img-compressrc',
      '.img-compressrc.json',
      '.img-compressrc.js',
      '.img-compressrc.cjs',
    ],
  });

  const result = await explorer.search();
  return (result?.config as ConfigFile) ?? {};
}

// ─── CLI definition ─────────────────────────────────────────────────

logger.banner();

program
  .name('img-compress')
  .description('⚡ Fast, cross-platform, zero-config image compression CLI')
  .version('1.0.0', '-v, --version')
  .argument('<folder-or-file>', 'input folder or image file')
  .option('-o, --output <dir>', 'write results to a directory')
  .option('-w, --width <number>', 'resize width in pixels')
  .option('-q, --quality <number>', 'target quality from 1-100')
  .option('--max-size <size>', 'target output size, e.g. 300kb or 2mb')
  .option('--webp', 'generate WebP output')
  .option('--avif', 'generate AVIF output')
  .option('--format <list>', 'comma-separated output formats, e.g. jpg,webp,avif')
  .option('--recursive', 'scan subfolders recursively')
  .option('--ignore <patterns>', 'comma-separated glob patterns to ignore')
  .option('--overwrite', 'replace original files in place')
  .option('--report', 'print detailed before/after size report')
  .option('--watch', 'watch for changes and re-compress')
  .option('--dry-run', 'preview output without writing files')
  .option('--clean', 'remove output directory before processing')
  .option('--smart-quality', 'auto-detect optimal quality per image')
  .option('--preserve-metadata', 'preserve EXIF/IPTC/XMP metadata')
  .option('--concurrency <number>', 'number of parallel workers')
  .action(async (input: string, cliOptions: Record<string, unknown>) => {
    try {
      const config = await loadConfig();
      const options = buildRuntimeOptions(input, cliOptions, config);
      const result = await compressImages(options);

      if (result?.summary?.filesProcessed === 0) {
        logger.warn('No supported images found.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
