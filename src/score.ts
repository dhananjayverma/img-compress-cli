import sharp from 'sharp';
import path from 'path';
import chalk from 'chalk';
import { discoverImages, formatBytes } from './utils.js';

// ─── Score Result ─────────────────────────────────────────────────────

export interface ScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totalImages: number;
  suggestions: string[];
  breakdown: {
    formatScore: number;
    sizeScore: number;
    modernFormatScore: number;
    metadataScore: number;
  };
}

// ─── Per-image score ──────────────────────────────────────────────────

interface ImageScore {
  format: number;   // 0–25
  size: number;     // 0–25
  modern: number;   // 0–25
  metadata: number; // 0–25
  suggestions: string[];
  file: string;
}

async function scoreImage(filePath: string): Promise<ImageScore> {
  const suggestions: string[] = [];
  let formatScore = 25;
  let sizeScore = 25;
  let modernScore = 25;
  let metadataScore = 25;

  try {
    const stat = await import('fs-extra').then((m) => m.stat(filePath));
    const metadata = await sharp(filePath).metadata();
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const basename = path.basename(filePath);
    const width = metadata.width ?? 0;
    const fileSizeKB = stat.size / 1024;

    // ── Format scoring ─────────────────────────────────────────────
    if (ext === 'avif') {
      formatScore = 25;
    } else if (ext === 'webp') {
      formatScore = 20;
    } else if (ext === 'jpg' || ext === 'jpeg') {
      formatScore = 12;
      suggestions.push(`${basename}: Convert to AVIF/WebP for ~50% size reduction`);
    } else if (ext === 'png' && !metadata.hasAlpha) {
      formatScore = 8;
      suggestions.push(`${basename}: PNG without alpha — convert to AVIF`);
    } else if (ext === 'gif') {
      formatScore = 5;
      suggestions.push(`${basename}: Replace GIF with WebP animation`);
    } else if (ext === 'tiff' || ext === 'tif') {
      formatScore = 3;
      suggestions.push(`${basename}: TIFF is not web-optimized — convert for web use`);
    }

    // ── Size scoring ───────────────────────────────────────────────
    if (fileSizeKB < 100) {
      sizeScore = 25;
    } else if (fileSizeKB < 300) {
      sizeScore = 20;
    } else if (fileSizeKB < 800) {
      sizeScore = 14;
      suggestions.push(`${basename}: File is ${formatBytes(stat.size)} — compress further`);
    } else if (fileSizeKB < 2000) {
      sizeScore = 8;
      suggestions.push(`${basename}: Large file (${formatBytes(stat.size)}) — compress and resize`);
    } else {
      sizeScore = 2;
      suggestions.push(`${basename}: Very large file (${formatBytes(stat.size)}) — needs aggressive optimization`);
    }

    // ── Modern format coverage score ──────────────────────────────
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const hasWebp = await import('fs-extra').then((m) => m.pathExists(path.join(dir, `${base}.webp`)));
    const hasAvif = await import('fs-extra').then((m) => m.pathExists(path.join(dir, `${base}.avif`)));

    if (ext === 'avif' || ext === 'webp') {
      modernScore = 25;
    } else if (hasAvif && hasWebp) {
      modernScore = 22;
    } else if (hasAvif || hasWebp) {
      modernScore = 14;
      suggestions.push(`${basename}: Missing ${hasWebp ? 'AVIF' : 'WebP'} variant`);
    } else {
      modernScore = 0;
      suggestions.push(`${basename}: No WebP or AVIF variant — run pixora compress --webp --avif`);
    }

    // ── Metadata/dimensions score ─────────────────────────────────
    if (width > 3000) {
      metadataScore -= 15;
      suggestions.push(`${basename}: Width ${width}px — resize to ≤1920px for web`);
    } else if (width > 1920) {
      metadataScore -= 8;
      suggestions.push(`${basename}: Width ${width}px is larger than typical display`);
    }

    // Check EXIF presence (stripping saves bytes)
    if (metadata.exif && stat.size > 50 * 1024) {
      metadataScore -= 5;
      suggestions.push(`${basename}: Contains EXIF metadata — strip for web to save bytes`);
    }
  } catch {
    return { format: 0, size: 0, modern: 0, metadata: 0, suggestions, file: filePath };
  }

  return {
    format: Math.max(0, formatScore),
    size: Math.max(0, sizeScore),
    modern: Math.max(0, modernScore),
    metadata: Math.max(0, metadataScore),
    suggestions,
    file: filePath,
  };
}

// ─── Main Scorer ──────────────────────────────────────────────────────

export async function scoreProject(inputPath: string): Promise<ScoreResult> {
  const files = await discoverImages(inputPath, { recursive: true });

  if (files.length === 0) {
    return {
      score: 100,
      grade: 'A',
      totalImages: 0,
      suggestions: [],
      breakdown: { formatScore: 100, sizeScore: 100, modernFormatScore: 100, metadataScore: 100 },
    };
  }

  const scores = await Promise.all(files.map(scoreImage));

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const formatScore = Math.round(avg(scores.map((s) => (s.format / 25) * 100)));
  const sizeScore = Math.round(avg(scores.map((s) => (s.size / 25) * 100)));
  const modernFormatScore = Math.round(avg(scores.map((s) => (s.modern / 25) * 100)));
  const metadataScore = Math.round(avg(scores.map((s) => (s.metadata / 25) * 100)));

  const overall = Math.round((formatScore + sizeScore + modernFormatScore + metadataScore) / 4);

  const grade =
    overall >= 90 ? 'A' :
    overall >= 75 ? 'B' :
    overall >= 60 ? 'C' :
    overall >= 45 ? 'D' : 'F';

  // Deduplicate suggestions and take top 10
  const allSuggestions = Array.from(new Set(scores.flatMap((s) => s.suggestions))).slice(0, 10);

  return {
    score: overall,
    grade,
    totalImages: files.length,
    suggestions: allSuggestions,
    breakdown: { formatScore, sizeScore, modernFormatScore, metadataScore },
  };
}

// ─── Printer ──────────────────────────────────────────────────────────

export function printScore(result: ScoreResult): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;

  const gradeColor =
    result.grade === 'A' ? chalk.green :
    result.grade === 'B' ? chalk.cyan :
    result.grade === 'C' ? chalk.yellow :
    result.grade === 'D' ? chalk.red :
    chalk.bgRed;

  console.log('\n' + accent.bold('📈 Pixora Performance Score'));
  console.log(dim('────────────────────────────────────────────────────────'));
  console.log(`\n  Overall Score:  ${chalk.bold(`${result.score}/100`)}  ${gradeColor(`[${result.grade}]`)}`);
  console.log(`  Total Images:   ${result.totalImages}`);

  console.log('\n  Score Breakdown:');
  console.log(`    Format Choice:      ${result.breakdown.formatScore}/100`);
  console.log(`    File Size:          ${result.breakdown.sizeScore}/100`);
  console.log(`    Modern Formats:     ${result.breakdown.modernFormatScore}/100`);
  console.log(`    Metadata/Dims:      ${result.breakdown.metadataScore}/100`);

  if (result.suggestions.length > 0) {
    console.log(`\n  ${chalk.yellow('💡 Top Suggestions:')}`);
    result.suggestions.forEach((s) => console.log(`    • ${s}`));
  } else {
    console.log(`\n  ${chalk.green('✔ No suggestions — everything looks great!')}`);
  }

  console.log('');
}
