import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { IMAGE_EXTENSIONS, OptionsSchema } from './types.js';
import type { CompressOptions, ConfigFile, ProcessResult, ReportSummary } from './types.js';

// ─── Size parsing ────────────────────────────────────────────────────

const SIZE_RE = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;

const SIZE_MULTIPLIERS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

export function parseSize(input: string | undefined | null): number | undefined {
  if (input == null || input === '') return undefined;
  const match = String(input).trim().toLowerCase().match(SIZE_RE);
  if (!match) {
    throw new Error(`Invalid size value "${input}". Use values like 300kb or 2mb.`);
  }
  const value = Number(match[1]);
  const unit = match[2] || 'b';
  return Math.round(value * SIZE_MULTIPLIERS[unit]!);
}

// ─── Formatting helpers ──────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

// ─── Path utilities ──────────────────────────────────────────────────

export function replaceExt(filePath: string, newExt: string): string {
  const ext = newExt.startsWith('.') ? newExt : `.${newExt}`;
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}${ext}`,
  );
}

export function normalizeFormatName(format: string): string {
  const value = format.toLowerCase();
  return value === 'jpeg' ? 'jpg' : value;
}

export function isSameImageFormat(a: string, b: string): boolean {
  return normalizeFormatName(a) === normalizeFormatName(b);
}

export function isSupportedImage(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).slice(1).toLowerCase());
}

export function isAnimatedGif(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.gif';
}

// ─── Ignore pattern normalization ────────────────────────────────────

export function normalizeIgnorePatterns(ignore: string | string[] | undefined): string[] {
  if (!ignore) return [];
  if (Array.isArray(ignore)) {
    return ignore
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return String(ignore)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// ─── Format resolution ──────────────────────────────────────────────

export function resolveTargetFormats(sourceFile: string, options: CompressOptions): string[] {
  const targets: string[] = [];
  if (options.formats.length > 0) {
    targets.push(...options.formats);
  } else {
    targets.push(path.extname(sourceFile).slice(1).toLowerCase());
  }
  return [...new Set(targets.map(normalizeFormatName))];
}

// ─── Output path building ───────────────────────────────────────────

export function getOutputRoot(
  inputPath: string,
  outputDir: string | undefined,
  overwrite: boolean,
): string | null {
  if (overwrite) return null;
  if (outputDir) return path.resolve(outputDir);

  const resolvedInput = path.resolve(inputPath);
  const stats = fs.existsSync(resolvedInput) ? fs.statSync(resolvedInput) : null;
  if (stats?.isDirectory()) {
    return `${resolvedInput}-compressed`;
  }

  const dir = path.dirname(resolvedInput);
  const base = path.basename(resolvedInput, path.extname(resolvedInput));
  return path.join(dir, `${base}-compressed`);
}

export interface BuildOutputPathOptions {
  inputRoot: string;
  sourceFile: string;
  outputRoot: string | null;
  targetFormat: string;
  overwrite: boolean;
}

export function buildOutputPath({
  inputRoot,
  sourceFile,
  outputRoot,
  targetFormat,
  overwrite,
}: BuildOutputPathOptions): string {
  if (overwrite) return sourceFile;

  const sourceRoot = path.resolve(inputRoot);
  const absoluteSource = path.resolve(sourceFile);
  const relative = path.relative(sourceRoot, absoluteSource);
  const hasRelative = relative && relative !== '..' && !relative.startsWith(`..${path.sep}`);

  if (outputRoot) {
    const baseTarget = hasRelative
      ? path.join(outputRoot, relative)
      : path.join(outputRoot, path.basename(sourceFile));
    return replaceExt(baseTarget, normalizeFormatName(targetFormat));
  }

  const sourceFormat = path.extname(sourceFile).slice(1).toLowerCase();
  const sameFormat = isSameImageFormat(sourceFormat, targetFormat);
  const directory = path.dirname(sourceFile);
  const base = path.basename(sourceFile, path.extname(sourceFile));
  const name = sameFormat ? `${base}-compressed` : base;
  return path.join(directory, `${name}.${normalizeFormatName(targetFormat)}`);
}

// ─── Image discovery ─────────────────────────────────────────────────

export interface DiscoverOptions {
  recursive?: boolean;
  ignore?: string[];
}

export async function discoverImages(
  inputPath: string,
  { recursive = false, ignore = [] }: DiscoverOptions = {},
): Promise<string[]> {
  const resolvedInput = path.resolve(inputPath);
  const stats = await fs.stat(resolvedInput);

  if (stats.isFile()) {
    return isSupportedImage(resolvedInput) ? [resolvedInput] : [];
  }

  const patterns = recursive ? ['**/*'] : ['*'];
  const files = await fg(patterns, {
    cwd: resolvedInput,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    dot: false,
    ignore,
  });

  return files.filter(isSupportedImage).sort();
}

// ─── Concurrency ─────────────────────────────────────────────────────

export function getDefaultConcurrency(value?: number): number {
  if (value !== undefined && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  return Math.max(1, Math.min(8, os.cpus().length || 1));
}

// ─── Format normalization ────────────────────────────────────────────

export function normalizeFormats(options: Record<string, unknown>): string[] {
  const fromFlags: string[] = [];
  if (options.webp) fromFlags.push('webp');
  if (options.avif) fromFlags.push('avif');

  if (options.format && typeof options.format === 'string') {
    fromFlags.push(
      ...options.format
        .split(',')
        .map((v: string) => v.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  return [...new Set(fromFlags)];
}

// ─── CLI options normalization ───────────────────────────────────────

export function normalizeCliOptions(cliOptions: Record<string, unknown>): Record<string, unknown> {
  const formats = [
    ...(Array.isArray(cliOptions.formats) ? (cliOptions.formats as string[]) : []),
    ...(cliOptions.webp ? ['webp'] : []),
    ...(cliOptions.avif ? ['avif'] : []),
    ...(typeof cliOptions.format === 'string'
      ? cliOptions.format
          .split(',')
          .map((v: string) => v.trim().toLowerCase())
          .filter(Boolean)
      : []),
  ];

  return {
    ...cliOptions,
    width: cliOptions.width === undefined ? undefined : Number(cliOptions.width),
    quality: cliOptions.quality === undefined ? undefined : Number(cliOptions.quality),
    concurrency: cliOptions.concurrency === undefined ? undefined : Number(cliOptions.concurrency),
    maxSize:
      cliOptions.maxSize === undefined
        ? undefined
        : parseSize(cliOptions.maxSize as string | undefined),
    ignore: normalizeIgnorePatterns(cliOptions.ignore as string | string[] | undefined),
    formats: [...new Set(formats.map(normalizeFormatName))],
  };
}

// ─── Build runtime options ───────────────────────────────────────────

export function buildRuntimeOptions(
  input: string,
  cliOptions: Record<string, unknown>,
  config: ConfigFile = {},
): CompressOptions {
  const merged: Record<string, unknown> = { input, ...config };

  for (const [key, value] of Object.entries(cliOptions)) {
    if (value === undefined) continue;
    if (typeof value === 'boolean') {
      if (value) merged[key] = value;
      continue;
    }
    merged[key] = value;
  }

  const parsed = normalizeCliOptions(merged);
  const result = {
    input: parsed.input as string,
    output: parsed.output as string | undefined,
    width: parsed.width as number | undefined,
    quality: parsed.quality as number | undefined,
    maxSize: parsed.maxSize as number | undefined,
    recursive: Boolean(parsed.recursive),
    overwrite: Boolean(parsed.overwrite),
    report: Boolean(parsed.report),
    watch: Boolean(parsed.watch),
    dryRun: Boolean(parsed.dryRun),
    clean: Boolean(parsed.clean),
    smartQuality: Boolean(parsed.smartQuality),
    preserveMetadata: Boolean(parsed.preserveMetadata),
    concurrency: getDefaultConcurrency(parsed.concurrency as number | undefined),
    ignore: parsed.ignore as string[],
    formats: parsed.formats as string[],
  };

  return OptionsSchema.parse(result);
}

// ─── Stats summary ──────────────────────────────────────────────────

export function buildStatsSummary(results: ProcessResult[]): ReportSummary {
  const sourceMap = new Map<string, number>();
  let filesSkipped = 0;

  for (const item of results) {
    if (item.skipped) {
      filesSkipped += 1;
      continue;
    }
    if (!sourceMap.has(item.source)) {
      sourceMap.set(item.source, item.inputBytes);
    }
  }

  const filesProcessed = sourceMap.size;
  const inputBytes = [...sourceMap.values()].reduce((sum, value) => sum + value, 0);
  const outputBytes = results
    .filter((r) => !r.skipped)
    .reduce((sum, item) => sum + item.outputBytes, 0);
  const savedBytes = inputBytes - outputBytes;
  const savedPercent = inputBytes > 0 ? (savedBytes / inputBytes) * 100 : 0;

  return {
    filesProcessed,
    filesSkipped,
    inputBytes,
    outputBytes,
    savedBytes,
    savedPercent,
  };
}
