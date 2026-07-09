import { z } from 'zod';

// ─── Image format types ──────────────────────────────────────────────

export const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'tif', 'gif'] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export const ENCODABLE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff'] as const;
export type EncodableFormat = (typeof ENCODABLE_FORMATS)[number];

export const IMAGE_EXTENSIONS = new Set<string>(SUPPORTED_FORMATS);

// ─── CLI / Runtime options ───────────────────────────────────────────

export const OptionsSchema = z.object({
  input: z.string().min(1),
  output: z.string().optional(),
  width: z.number().int().positive().optional(),
  quality: z.number().int().min(1).max(100).optional(),
  maxSize: z.number().int().positive().optional(),
  recursive: z.boolean(),
  overwrite: z.boolean(),
  report: z.boolean(),
  watch: z.boolean(),
  dryRun: z.boolean(),
  clean: z.boolean(),
  smartQuality: z.boolean(),
  preserveMetadata: z.boolean(),
  concurrency: z.number().int().positive(),
  ignore: z.array(z.string()),
  formats: z.array(z.string()),
  profile: z.string().optional(),
  bestFormat: z.boolean().optional(),
});

export type CompressOptions = z.infer<typeof OptionsSchema>;

// ─── Processing results ─────────────────────────────────────────────

export interface ProcessResult {
  source: string;
  output: string;
  format: string;
  inputBytes: number;
  outputBytes: number;
  skipped?: boolean;
  skipReason?: string;
}

export interface ReportSummary {
  filesProcessed: number;
  filesSkipped: number;
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedPercent: number;
}

// ─── Encoder options ─────────────────────────────────────────────────

export interface EncoderOptions {
  quality?: number;
  preserveMetadata?: boolean;
}

// ─── Config file shape ───────────────────────────────────────────────

export interface ConfigFile {
  quality?: number;
  width?: number;
  recursive?: boolean;
  webp?: boolean;
  avif?: boolean;
  format?: string;
  output?: string;
  overwrite?: boolean;
  report?: boolean;
  watch?: boolean;
  dryRun?: boolean;
  clean?: boolean;
  smartQuality?: boolean;
  preserveMetadata?: boolean;
  concurrency?: number;
  ignore?: string | string[];
  maxSize?: string;
  [key: string]: unknown;
}
