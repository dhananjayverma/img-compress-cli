import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { compressImages } from './compress.js';
import type { CompressOptions } from './types.js';
import { logger } from './logger.js';

export interface Rule {
  if: string; // e.g. "size > 2MB" or "extension == png" or "width > 3000" or "folder == logos"
  action: string[]; // e.g. ["compress", "convert:webp", "resize:1920", "lossless", "avif"]
}

export interface RulesConfig {
  rules: Rule[];
}

export function parseRuleCondition(cond: string): { key: string; operator: string; val: string } {
  const parts = cond.split(/\s+/);
  if (parts.length >= 3) {
    return {
      key: parts[0]!.toLowerCase(),
      operator: parts[1]!,
      val: parts.slice(2).join(' '),
    };
  }
  return { key: '', operator: '', val: '' };
}

function parseSizeVal(val: string): number {
  const clean = val.toUpperCase();
  if (clean.endsWith('MB')) return parseFloat(clean) * 1024 * 1024;
  if (clean.endsWith('KB')) return parseFloat(clean) * 1024;
  return parseFloat(clean);
}

export async function evaluateRule(
  filePath: string,
  rule: Rule
): Promise<boolean> {
  const { key, operator, val } = parseRuleCondition(rule.if);
  if (!key) return false;

  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();

  if (key === 'size') {
    const limit = parseSizeVal(val);
    if (operator === '>') return stat.size > limit;
    if (operator === '<') return stat.size < limit;
  }

  if (key === 'extension' || key === 'ext') {
    const compareVal = val.toLowerCase().replace(/['"]/g, '');
    if (operator === '==' || operator === '=') return ext === compareVal;
  }

  if (key === 'width' || key === 'height') {
    try {
      const meta = await sharp(filePath).metadata();
      const current = key === 'width' ? (meta.width ?? 0) : (meta.height ?? 0);
      const limit = parseInt(val, 10);
      if (operator === '>') return current > limit;
      if (operator === '<') return current < limit;
      if (operator === '==' || operator === '=') return current === limit;
    } catch {}
  }

  if (key === 'folder') {
    const parentDir = path.basename(path.dirname(filePath)).toLowerCase();
    const compareVal = val.toLowerCase().replace(/['"]/g, '');
    if (operator === '==' || operator === '=') return parentDir === compareVal;
  }

  return false;
}

export async function executeRuleActions(
  filePath: string,
  actions: string[]
): Promise<void> {
  let quality = 80;
  let width: number | undefined;
  let formats: string[] = [];

  for (const action of actions) {
    const [name, val] = action.split(':');
    if (!name) continue;

    const lowerName = name.trim().toLowerCase();

    if (lowerName === 'compress') {
      // triggers compression (kept in-place)
      formats.push(path.extname(filePath).slice(1).toLowerCase());
    } else if (lowerName === 'convert' && val) {
      formats.push(val.trim().toLowerCase());
    } else if (lowerName === 'resize' && val) {
      width = parseInt(val, 10);
    } else if (lowerName === 'webp') {
      formats.push('webp');
    } else if (lowerName === 'avif') {
      formats.push('avif');
    } else if (lowerName === 'lossless') {
      quality = 100;
    }
  }

  if (formats.length === 0) return;

  const baseOptions: CompressOptions = {
    input: filePath,
    overwrite: true,
    recursive: false,
    quality,
    width,
    formats,
    ignore: [],
    watch: false,
    report: false,
    dryRun: false,
    clean: false,
    smartQuality: false,
    preserveMetadata: false,
    concurrency: 1,
  };

  logger.info(`Rule matched actions for ${path.basename(filePath)}: ${actions.join(', ')}`);
  await compressImages(baseOptions);
}

export async function runRulesOnFolder(folder: string, rulesConfigPath: string): Promise<void> {
  if (!(await fs.pathExists(rulesConfigPath))) {
    throw new Error(`Rules config not found: ${rulesConfigPath}`);
  }

  let config: RulesConfig;
  try {
    // Parse JSON directly (we can support both json/yaml. Here we support JSON/JS style)
    config = await fs.readJson(rulesConfigPath);
  } catch {
    // fallback if it's imported module
    const absolute = path.resolve(rulesConfigPath);
    const mod = await import(absolute);
    config = mod.default || mod;
  }

  const { discoverImages } = await import('./utils.js');
  const files = await discoverImages(path.resolve(folder), { recursive: true });

  for (const file of files) {
    for (const rule of config.rules) {
      const match = await evaluateRule(file, rule);
      if (match) {
        await executeRuleActions(file, rule.action);
      }
    }
  }
}
