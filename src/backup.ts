import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';

const BACKUP_DIR = path.join(process.cwd(), '.pixora', 'backups');

export async function backupFile(sourceFile: string): Promise<void> {
  const relativePath = path.relative(process.cwd(), sourceFile);
  const targetPath = path.join(BACKUP_DIR, relativePath);
  await fs.ensureDir(path.dirname(targetPath));
  await fs.copy(sourceFile, targetPath);
}

export async function restoreBackups(): Promise<void> {
  if (!(await fs.pathExists(BACKUP_DIR))) {
    logger.warn('No backups found to restore.');
    return;
  }

  const getFilesRecursive = async (dir: string): Promise<string[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) => {
        const res = path.resolve(dir, entry.name);
        return entry.isDirectory() ? getFilesRecursive(res) : res;
      })
    );
    return files.flat();
  };

  const files = await getFilesRecursive(BACKUP_DIR);
  for (const file of files) {
    const rel = path.relative(BACKUP_DIR, file);
    const dest = path.join(process.cwd(), rel);
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(file, dest, { overwrite: true });
    logger.success(`Restored: ${rel}`);
  }

  await fs.remove(BACKUP_DIR);
  logger.success('Undo complete. Backup directory cleared.');
}
