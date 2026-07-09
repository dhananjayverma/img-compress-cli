import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), '.pixora');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

export interface CacheEntry {
  hash: string;
  mtime: number;
  size: number;
}

export async function getCache(): Promise<Record<string, CacheEntry>> {
  try {
    if (await fs.pathExists(CACHE_FILE)) {
      return await fs.readJson(CACHE_FILE);
    }
  } catch {}
  return {};
}

export async function saveCache(cache: Record<string, CacheEntry>): Promise<void> {
  await fs.ensureDir(CACHE_DIR);
  await fs.writeJson(CACHE_FILE, cache, { spaces: 2 });
}

export async function getFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('md5').update(buffer).digest('hex');
}
