import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

// ─── Paths ───────────────────────────────────────────────────────────

const DB_DIR = path.join(process.cwd(), '.pixora');
const DB_FILE = path.join(DB_DIR, 'database.json');
const HISTORY_FILE = path.join(DB_DIR, 'history.json');

// ─── Types ───────────────────────────────────────────────────────────

export interface FileRecord {
  hash: string;
  mtime: number;
  inputSize: number;
  outputSize: number;
  compressionRatio: number;
  savedBytes: number;
  savedPercent: number;
  quality?: number;
  format: string;
  lastModified: string;
  processedAt: string;
}

export interface RunRecord {
  runId: string;
  startedAt: string;
  finishedAt: string;
  filesProcessed: number;
  filesSkipped: number;
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedPercent: number;
  durationMs: number;
}

export type Database = Record<string, FileRecord>;
export type History = RunRecord[];

// ─── Database helpers ─────────────────────────────────────────────────

export async function loadDatabase(): Promise<Database> {
  try {
    if (await fs.pathExists(DB_FILE)) {
      return await fs.readJson(DB_FILE);
    }
  } catch {}
  return {};
}

export async function saveDatabase(db: Database): Promise<void> {
  await fs.ensureDir(DB_DIR);
  await fs.writeJson(DB_FILE, db, { spaces: 2 });
}

export async function upsertRecord(
  filePath: string,
  record: Omit<FileRecord, 'hash' | 'lastModified' | 'processedAt'>
): Promise<void> {
  const db = await loadDatabase();
  const buffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const stat = await fs.stat(filePath);

  db[filePath] = {
    ...record,
    hash,
    lastModified: new Date(stat.mtime).toISOString(),
    processedAt: new Date().toISOString(),
  };

  await saveDatabase(db);
}

export async function getRecord(filePath: string): Promise<FileRecord | undefined> {
  const db = await loadDatabase();
  return db[filePath];
}

export async function isFileChanged(filePath: string): Promise<boolean> {
  try {
    const db = await loadDatabase();
    const record = db[filePath];
    if (!record) return true;

    const stat = await fs.stat(filePath);
    if (stat.mtimeMs !== record.mtime) {
      const buffer = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      return hash !== record.hash;
    }
    return false;
  } catch {
    return true;
  }
}

// ─── History helpers ──────────────────────────────────────────────────

export async function loadHistory(): Promise<History> {
  try {
    if (await fs.pathExists(HISTORY_FILE)) {
      return await fs.readJson(HISTORY_FILE);
    }
  } catch {}
  return [];
}

export async function appendRunRecord(record: RunRecord): Promise<void> {
  await fs.ensureDir(DB_DIR);
  const history = await loadHistory();
  history.push(record);
  // Keep last 100 runs
  const trimmed = history.slice(-100);
  await fs.writeJson(HISTORY_FILE, trimmed, { spaces: 2 });
}

export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
