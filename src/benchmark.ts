import sharp from 'sharp';
import path from 'path';
import chalk from 'chalk';
import { discoverImages, formatBytes } from './utils.js';
import { logger } from './logger.js';

const FORMATS = ['jpg', 'webp', 'avif', 'png'] as const;
type BenchFormat = (typeof FORMATS)[number];

interface FormatResult {
  format: BenchFormat;
  outputBytes: number;
  quality: number;
  encodeMs: number;
}

interface BenchmarkResult {
  source: string;
  inputBytes: number;
  formats: FormatResult[];
  recommendation: BenchFormat;
}

async function benchmarkFile(inputFile: string): Promise<BenchmarkResult> {
  const metadata = await sharp(inputFile).metadata();
  const inputBytes = metadata.size ?? 0;

  const formatResults: FormatResult[] = [];

  for (const fmt of FORMATS) {
    const quality = fmt === 'avif' ? 55 : fmt === 'png' ? undefined : 80;
    const start = Date.now();

    let sharpPipeline = sharp(inputFile, { failOn: 'none' }).rotate();

    switch (fmt) {
      case 'jpg':
        sharpPipeline = sharpPipeline.jpeg({ quality: quality!, mozjpeg: true });
        break;
      case 'webp':
        sharpPipeline = sharpPipeline.webp({ quality: quality! });
        break;
      case 'avif':
        sharpPipeline = sharpPipeline.avif({ quality: quality! });
        break;
      case 'png':
        sharpPipeline = sharpPipeline.png({ compressionLevel: 9 });
        break;
    }

    const buffer = await sharpPipeline.toBuffer();
    const encodeMs = Date.now() - start;

    formatResults.push({
      format: fmt,
      outputBytes: buffer.length,
      quality: quality ?? 100,
      encodeMs,
    });
  }

  // Recommend smallest output that is a modern format
  const sorted = [...formatResults].sort((a, b) => a.outputBytes - b.outputBytes);
  const recommendation = sorted[0]?.format ?? 'webp';

  return {
    source: inputFile,
    inputBytes,
    formats: formatResults,
    recommendation,
  };
}

export async function runBenchmark(
  input: string,
  options: { json?: boolean } = {}
): Promise<void> {
  const files = await discoverImages(input, { recursive: false });
  if (files.length === 0) {
    throw new Error('No images found to benchmark.');
  }

  const allResults: BenchmarkResult[] = [];

  for (const file of files.slice(0, 5)) {
    // Limit to 5 files
    logger.dim(`Benchmarking: ${path.basename(file)}…`);
    const result = await benchmarkFile(file);
    allResults.push(result);
  }

  if (options.json) {
    console.log(JSON.stringify(allResults, null, 2));
    return;
  }

  for (const result of allResults) {
    console.log(
      '\n' + chalk.hex('#7C3AED').bold(`📈 Benchmark: ${path.basename(result.source)}`)
    );
    console.log(
      chalk.dim(`   Input: ${formatBytes(result.inputBytes)}\n`)
    );
    console.log(
      chalk.bold('   Format') +
        chalk.bold('     Size') +
        chalk.bold('     Ratio') +
        chalk.bold('     Time')
    );
    console.log(chalk.dim('   ' + '─'.repeat(44)));

    for (const f of result.formats) {
      const ratio = result.inputBytes > 0 ? ((result.inputBytes - f.outputBytes) / result.inputBytes) * 100 : 0;
      const isRecommended = f.format === result.recommendation;
      const label = isRecommended ? chalk.green(`${f.format} ✔`) : chalk.dim(f.format);
      const sizeStr = formatBytes(f.outputBytes).padStart(8);
      const ratioStr = `${ratio > 0 ? '-' : '+'}${Math.abs(ratio).toFixed(1)}%`.padStart(8);
      const timeStr = `${f.encodeMs.toFixed(0)}ms`.padStart(7);
      console.log(`   ${label.padEnd(14)} ${sizeStr} ${ratioStr} ${timeStr}`);
    }

    console.log(
      chalk.dim('\n   💡 Recommended: ') +
        chalk.green.bold(result.recommendation.toUpperCase())
    );
  }
}
