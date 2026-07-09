import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { discoverImages } from './utils.js';
import { logger } from './logger.js';

// ─── Smart Rename ─────────────────────────────────────────────────────

export async function smartRename(filePath: string, customPrefix?: string): Promise<string> {
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);
  const metadata = await sharp(filePath).metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  let prefix = customPrefix;
  if (!prefix) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    prefix = `${today}-${width}x${height}`;
  }

  // Find a unique name
  let idx = 1;
  let newPath = path.join(dir, `${prefix}${ext}`);
  while (await fs.pathExists(newPath)) {
    newPath = path.join(dir, `${prefix}-${idx}${ext}`);
    idx++;
  }

  await fs.move(filePath, newPath);
  logger.success(`Renamed: ${path.basename(filePath)} → ${path.basename(newPath)}`);
  return newPath;
}

// ─── Auto Folder Organization ─────────────────────────────────────────

export async function organizeFolder(folder: string): Promise<void> {
  const resolved = path.resolve(folder);
  const files = await discoverImages(resolved, { recursive: false });

  if (files.length === 0) {
    logger.info('No images to organize in root directory.');
    return;
  }

  const photosDir = path.join(resolved, 'photos');
  const logosDir = path.join(resolved, 'logos');
  const iconsDir = path.join(resolved, 'icons');
  const bannersDir = path.join(resolved, 'banners');

  for (const file of files) {
    try {
      const metadata = await sharp(file).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      const ratio = width / height;

      let targetDir = photosDir;

      if (width <= 128 && height <= 128) {
        targetDir = iconsDir;
      } else if (ratio > 2.5 && width >= 1000) {
        targetDir = bannersDir;
      } else {
        // Logo detection: PNG/SVG with alpha + solid characteristics
        const hasAlpha = metadata.hasAlpha ?? false;
        const ext = path.extname(file).toLowerCase();
        if ((hasAlpha && ext === '.png') || ext === '.svg') {
          targetDir = logosDir;
        }
      }

      await fs.ensureDir(targetDir);
      const targetPath = path.join(targetDir, path.basename(file));
      await fs.move(file, targetPath);
      logger.success(`Moved: ${path.basename(file)} → ${path.relative(resolved, targetPath)}`);
    } catch {}
  }
}
