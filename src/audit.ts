import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import exifr from 'exifr';
import Table from 'cli-table3';
import chalk from 'chalk';
import { discoverImages, formatBytes } from './utils.js';

export interface AuditResult {
  largestImages: { path: string; size: number }[];
  exactDuplicates: string[][];
  similarImages: { fileA: string; fileB: string; distance: number }[];
  missingWebP: string[];
  missingAVIF: string[];
  totalImages: number;
}

async function computeExactHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function computeVisualHash(filePath: string): Promise<string> {
  try {
    const buf = await sharp(filePath)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i]!;
    }
    const mean = sum / buf.length;

    let hash = '';
    for (let i = 0; i < buf.length; i++) {
      hash += buf[i]! >= mean ? '1' : '0';
    }
    return hash;
  } catch {
    return '';
  }
}

function getHammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

export async function runAudit(inputFolder: string): Promise<AuditResult> {
  const files = await discoverImages(inputFolder, { recursive: true });
  if (files.length === 0) {
    throw new Error('No images found to audit.');
  }

  const largestImages: { path: string; size: number }[] = [];
  const hashes: Record<string, string[]> = {};
  const visualHashes: { path: string; hash: string }[] = [];
  const missingWebP: string[] = [];
  const missingAVIF: string[] = [];

  for (const file of files) {
    const stat = await fs.stat(file);
    largestImages.push({ path: file, size: stat.size });

    const exactHash = await computeExactHash(file);
    if (!hashes[exactHash]) hashes[exactHash] = [];
    hashes[exactHash]!.push(file);

    const visHash = await computeVisualHash(file);
    if (visHash) {
      visualHashes.push({ path: file, hash: visHash });
    }

    const ext = path.extname(file).toLowerCase();
    if (ext !== '.webp' && ext !== '.avif') {
      const dir = path.dirname(file);
      const base = path.basename(file, ext);
      const webpPath = path.join(dir, `${base}.webp`);
      const avifPath = path.join(dir, `${base}.avif`);

      if (!(await fs.pathExists(webpPath))) missingWebP.push(file);
      if (!(await fs.pathExists(avifPath))) missingAVIF.push(file);
    }
  }

  const exactDuplicates = Object.values(hashes).filter((arr) => arr.length > 1);

  const similarImages: { fileA: string; fileB: string; distance: number }[] = [];
  for (let i = 0; i < visualHashes.length; i++) {
    for (let j = i + 1; j < visualHashes.length; j++) {
      const a = visualHashes[i]!;
      const b = visualHashes[j]!;
      const dist = getHammingDistance(a.hash, b.hash);
      if (dist <= 8) {
        similarImages.push({ fileA: a.path, fileB: b.path, distance: dist });
      }
    }
  }

  const totalImages = largestImages.length;
  largestImages.sort((a, b) => b.size - a.size);

  return {
    largestImages: largestImages.slice(0, 5),
    exactDuplicates,
    similarImages,
    missingWebP,
    missingAVIF,
    totalImages,
  };
}

export interface ImageStats {
  resolution: string;
  aspectRatio: string;
  bitDepth?: number;
  hasAlpha: boolean;
  colorProfile?: string;
  exif?: Record<string, any>;
}

export async function getImageStats(filePath: string): Promise<ImageStats> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const aspect = divisor > 0 ? `${width / divisor}:${height / divisor}` : 'N/A';

  let exifData: Record<string, any> | undefined;
  try {
    exifData = await exifr.parse(filePath, {
      tiff: true,
      xmp: true,
      gps: true,
      exif: true,
    });
  } catch {}

  const depthBits: Record<string, number> = {
    uchar: 8,
    char: 8,
    ushort: 16,
    short: 16,
    uint: 32,
    int: 32,
    float: 32,
    double: 64,
    complex: 64,
    dpcomplex: 128,
  };

  return {
    resolution: `${width}x${height}px`,
    aspectRatio: aspect,
    bitDepth: metadata.depth != null ? depthBits[metadata.depth] : undefined,
    hasAlpha: metadata.hasAlpha ?? false,
    colorProfile: metadata.space,
    exif: exifData,
  };
}

export function printAuditReport(result: AuditResult): void {
  console.log('\n' + chalk.hex('#7C3AED').bold('📊 Pixora Asset Audit Report'));
  console.log(chalk.dim('────────────────────────────────────────────────────────────────────────'));

  console.log(`\n${chalk.yellow.bold('📁 Top 5 Largest Images:')}`);
  const largestTable = new Table({
    head: [chalk.white('File'), chalk.white('Size')],
    colWidths: [55, 15],
  });
  result.largestImages.forEach((img) => {
    largestTable.push([path.relative(process.cwd(), img.path), formatBytes(img.size)]);
  });
  console.log(largestTable.toString());

  if (result.exactDuplicates.length > 0) {
    console.log(`\n${chalk.red.bold('👥 Exact Duplicates Found:')}`);
    result.exactDuplicates.forEach((group, idx) => {
      console.log(chalk.dim(`  Group #${idx + 1}:`));
      group.forEach((f) => console.log(`    - ${path.relative(process.cwd(), f)}`));
    });
  } else {
    console.log(`\n${chalk.green('✔ No exact duplicates found.')}`);
  }

  if (result.similarImages.length > 0) {
    console.log(`\n${chalk.yellow.bold('🖼️ Visually Similar Images:')}`);
    result.similarImages.forEach((sim) => {
      console.log(
        `  ${path.relative(process.cwd(), sim.fileA)} <-> ${path.relative(process.cwd(), sim.fileB)} ${chalk.dim(`(similarity metric: ${64 - sim.distance}/64)`)}`
      );
    });
  }

  console.log(`\n${chalk.cyan.bold('⚡ Modern Format Coverage:')}`);
  console.log(`  - Missing WebP: ${result.missingWebP.length} files`);
  console.log(`  - Missing AVIF: ${result.missingAVIF.length} files`);

  if (result.missingWebP.length > 0) {
    console.log(chalk.dim('\n💡 Tip: Run `pixora compress --webp` to automatically generate WebP files.'));
  }
}
